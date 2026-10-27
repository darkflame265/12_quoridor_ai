"""Concurrent games, batched inference, parallel rule processes, resumable data.

This module generates data only. It never activates a model in the live game.
"""
import argparse
from collections import OrderedDict, deque
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
import os
from pathlib import Path
import threading
import time
import numpy as np
import torch
from train import (ROOT, FEATURES, ACTIONS, Bridge, PolicyValue, MCTS, features,
                   state_key, apply_action, action_object, canonical_action,
                   expand_prediction)

FORMAT='atlas-batched-selfplay-v1'

def sha_file(path):
    digest=hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda:stream.read(1024*1024),b''): digest.update(block)
    return digest.hexdigest()

def replace_file(source,destination):
    # Indexers/antivirus can briefly hold a Windows file without sharing rename.
    # Preserve the old destination and retry the atomic operation; never unlink it.
    for attempt in range(12):
        try: os.replace(source,destination); return
        except PermissionError as error:
            if getattr(error,'winerror',None) not in {5,32,33} or attempt==11: raise
            time.sleep(min(.01*2**attempt,.1))

def atomic_json(path,value):
    path=Path(path); temporary=path.with_name(path.name+'.tmp')
    with temporary.open('w',encoding='utf-8',newline='\n') as stream:
        json.dump(value,stream,ensure_ascii=False,indent=2); stream.flush(); os.fsync(stream.fileno())
    replace_file(temporary,path)

def remember(cache,key,value,limit):
    cache[key]=value; cache.move_to_end(key)
    while len(cache)>limit: cache.popitem(last=False)

class RulePool:
    """One independent persistent Node/WASM process per CPU worker thread."""
    def __init__(self,workers=2,cache_limit=10000):
        self.workers=workers; self.cache_limit=cache_limit; self.cache=OrderedDict()
        self.local=threading.local(); self.bridges=[]; self.lock=threading.Lock()
        self.seconds=0.; self.rows=0; self.hits=0; self.closed=False
        barrier=threading.Barrier(workers); started=time.monotonic()
        def initialize():
            bridge=Bridge(); self.local.bridge=bridge
            with self.lock: self.bridges.append(bridge)
            bridge.call(op='initial'); barrier.wait(timeout=30)
        self.executor=ThreadPoolExecutor(max_workers=workers,initializer=initialize)
        try:
            jobs=[self.executor.submit(lambda:None) for _ in range(workers)]
            for job in jobs: job.result()
        except BaseException:
            self.close(); raise
        self.startup_seconds=time.monotonic()-started
    def _chunk(self,states): return self.local.bridge.inspect_many(states)
    def inspect_many(self,states):
        started=time.monotonic(); keys=[state_key(s) for s in states]
        resolved={k:self.cache[k] for k in keys if k in self.cache}
        for key in resolved: self.cache.move_to_end(key)
        missing=OrderedDict((k,s) for k,s in zip(keys,states) if k not in self.cache)
        self.hits+=len(states)-len(missing); self.rows+=len(missing)
        items=list(missing.items()); size=min(512,max(1,(len(items)+self.workers-1)//self.workers))
        chunks=[items[i:i+size] for i in range(0,len(items),size)]
        outputs=self.executor.map(self._chunk,[[s for _,s in chunk] for chunk in chunks])
        for chunk,infos in zip(chunks,outputs):
            if len(chunk)!=len(infos): raise RuntimeError('Rules batch length mismatch')
            for (key,_),info in zip(chunk,infos): resolved[key]=info; remember(self.cache,key,info,self.cache_limit)
        result=[resolved[k] for k in keys]
        self.seconds+=time.monotonic()-started; return result
    def stats(self): return {'workers':self.workers,'processes':len(self.bridges),'startupSeconds':self.startup_seconds,'inspectSeconds':self.seconds,'inspectedRows':self.rows,'cacheHits':self.hits}
    def close(self):
        if self.closed: return
        self.closed=True; self.executor.shutdown(wait=True,cancel_futures=True)
        for bridge in self.bridges: bridge.close()
    def __enter__(self): return self
    def __exit__(self,*unused): self.close()

class BatchedEvaluator:
    def __init__(self,model,rules,max_batch=64,cache_limit=10000):
        self.model=model.eval(); self.device=next(model.parameters()).device; self.rules=rules
        self.max_batch=max_batch; self.cache_limit=cache_limit; self.cache=OrderedDict()
        self.calls=0; self.rows=0; self.hits=0; self.seconds=0.; self.histogram={}
        started=time.monotonic()
        with torch.inference_mode():
            for _ in range(3): self.model(torch.zeros(max_batch,FEATURES,device=self.device))
        if self.device.type=='cuda': torch.cuda.synchronize(self.device); torch.cuda.reset_peak_memory_stats(self.device)
        self.warmup_seconds=time.monotonic()-started
    def expand(self,nodes,bootstrap):
        states=[node.state for node in nodes]; keys=[state_key(s) for s in states]
        predictions={k:self.cache[k] for k in keys if k in self.cache}
        for key in predictions: self.cache.move_to_end(key)
        infos=self.rules.inspect_many(states)
        missing=list(OrderedDict((k,s) for k,s in zip(keys,states) if k not in self.cache).items())
        self.hits+=len(nodes)-len(missing)
        for i in range(0,len(missing),self.max_batch):
            chunk=missing[i:i+self.max_batch]; started=time.monotonic()
            inputs=torch.from_numpy(np.stack([features(s) for _,s in chunk])).to(self.device)
            with torch.inference_mode(): logits,values=self.model(inputs)
            logits=logits.cpu().numpy(); values=values.cpu().numpy()
            self.seconds+=time.monotonic()-started; self.calls+=1; self.rows+=len(chunk)
            self.histogram[str(len(chunk))]=self.histogram.get(str(len(chunk)),0)+1
            for (key,_),row,value in zip(chunk,logits,values):
                prediction=(row.copy(),float(value)); predictions[key]=prediction; remember(self.cache,key,prediction,self.cache_limit)
        return [expand_prediction(node,info,*predictions[key],bootstrap) for node,info,key in zip(nodes,infos,keys)]
    def stats(self):
        return {'device':str(self.device),'forwardCalls':self.calls,'inferredRows':self.rows,'meanBatch':self.rows/max(1,self.calls),'batchHistogram':self.histogram,'cacheHits':self.hits,'inferenceSeconds':self.seconds,'warmupSeconds':self.warmup_seconds,'peakGpuBytes':torch.cuda.max_memory_allocated(self.device) if self.device.type=='cuda' else 0}

def game_stream(opening,args,iteration,game_id):
    seed=(args.seed+iteration*1000003+game_id*97409)%(2**63-1)
    rng=np.random.default_rng(seed); bootstrap=args.bootstrap*(.8**iteration)
    search=MCTS(None,None,rng,args.simulations,bootstrap)
    state=opening['state']; records=list(opening['records']); samples=[]; seen={}; winner=None; reason='ply cap'
    for ply in range(args.max_plies):
        key=state_key(state); seen[key]=seen.get(key,0)+1
        if seen[key]>=3: reason='repetition draw'; break
        action,pi=yield from search.search_stream(state,noise=True,temperature=1 if ply<8 else 0)
        samples.append((features(state),pi,state['turn'])); records.append(action_object(action)); state=apply_action(state,action)
        if state['winner'] is not None: winner=state['winner']; reason='goal reached'; break
    examples=[] if reason=='ply cap' else [(x,pi,0. if winner is None else 1. if turn==winner else -1.) for x,pi,turn in samples]
    return examples,{'version':1,'gameId':game_id,'seed':seed,'bootstrap':bootstrap,'openingPlies':len(opening['records']),'records':records,'winner':winner,'reason':reason,'plies':len(samples),'trainingSamples':len(examples)},state

def generate_games(model,bridge,args,iteration=0,game_ids=None,metrics=None,on_complete=None):
    """Yield completed games in ID order; persist callbacks run immediately.

    Close the generator if stopping early, so every owned rules process closes.
    """
    if not 1<=args.parallel_games<=256 or not 1<=args.rules_workers<=16 or not 1<=args.inference_batch<=512 or args.games<0 or args.simulations<1 or args.max_plies<1 or iteration<0 or not 0<=args.bootstrap<=1: raise ValueError('Invalid scheduler budget')
    ids=list(range(args.games)) if game_ids is None else sorted(game_ids)
    if len(ids)!=len(set(ids)) or any(i<0 or i>=args.games for i in ids): raise ValueError('Invalid game IDs')
    if not ids: return
    metrics={} if metrics is None else metrics; started=time.monotonic(); active={}; pending={}; completed={}; cursor=0; next_output=0; cycles=0
    with RulePool(args.rules_workers) as rules:
        evaluator=BatchedEvaluator(model,rules,args.inference_batch); generation_started=time.monotonic()
        try:
            while next_output<len(ids):
                while cursor<len(ids) and len(active)+len(completed)<args.parallel_games:
                    game_id=ids[cursor]; cursor+=1
                    opening=bridge.call(op='initial') if game_id%2==0 else bridge.call(op='opening',index=(iteration+game_id)%6)
                    stream=game_stream(opening,args,iteration,game_id); active[game_id]=stream; pending[game_id]=next(stream)
                requests=list(pending); values=evaluator.expand([pending[i] for i in requests],args.bootstrap*(.8**iteration)); cycles+=1
                for game_id,value in zip(requests,values):
                    try: pending[game_id]=active[game_id].send(value)
                    except StopIteration as finished: result=finished.value
                    else: continue
                    examples,game,state=result
                    if bridge.call(op='validate',records=game['records'])['state']!=state: raise RuntimeError('Batched transition disagrees with independent rules')
                    del pending[game_id]; del active[game_id]; completed[game_id]=(examples,game)
                    if on_complete is not None: on_complete(game_id,examples,game)
                while next_output<len(ids) and ids[next_output] in completed:
                    yield completed.pop(ids[next_output]); next_output+=1
        finally:
            for stream in active.values(): stream.close()
            metrics.update({'rules':rules.stats(),'inference':evaluator.stats(),'schedulerCycles':cycles,'generationSeconds':time.monotonic()-generation_started,'totalSeconds':time.monotonic()-started})

def arrays(examples):
    if not examples: return np.empty((0,FEATURES),np.float32),np.empty((0,ACTIONS),np.float32),np.empty(0,np.float32)
    return np.stack([e[0] for e in examples]).astype(np.float32),np.stack([e[1] for e in examples]).astype(np.float32),np.asarray([e[2] for e in examples],np.float32)

def verify_game(game,x,pi,z,bridge):
    n=game['trainingSamples']
    if x.shape!=(n,FEATURES) or pi.shape!=(n,ACTIONS) or z.shape!=(n,): raise ValueError('Dataset shape mismatch')
    if any(a.dtype!=np.float32 for a in [x,pi,z]): raise ValueError('Dataset must use float32')
    if any(not np.isfinite(a).all() for a in [x,pi,z]) or (pi<0).any(): raise ValueError('Invalid training targets')
    if n and not np.allclose(pi.sum(axis=1),1,atol=1e-5): raise ValueError('Policy mass is not normalized')
    state=bridge.call(op='initial')['state']; states=[]; keys=[]
    for i,action in enumerate(game['records']):
        if i>=game['openingPlies']: states.append(state); keys.append(state_key(state))
        a=action['y']*9+action['x'] if action['type']=='move' else 81+(64 if action['o']=='v' else 0)+action['y']*8+action['x']
        state=apply_action(state,a)
    if bridge.call(op='validate',records=game['records'])['state']!=state or state['winner']!=game['winner']: raise ValueError('Dataset replay mismatch')
    if len(states)!=game['plies']: raise ValueError('Replay sample count mismatch')
    if game['reason']=='ply cap':
        if n!=0 or state['winner'] is not None: raise ValueError('Capped game was labeled')
        return
    if n!=len(states): raise ValueError('Missing labeled positions')
    if game['reason']=='repetition draw':
        all_keys=keys+[state_key(state)]
        if state['winner'] is not None or max(all_keys.count(k) for k in set(all_keys))<3: raise ValueError('Unproven repetition label')
    elif game['reason']!='goal reached' or state['winner'] is None: raise ValueError('Invalid game result')
    for start in range(0,n,128):
        chunk=states[start:start+128]; infos=bridge.inspect_many(chunk)
        for index,(s,info) in enumerate(zip(chunk,infos),start):
            if not np.allclose(x[index],features(s),atol=1e-6,rtol=0): raise ValueError('Features disagree with replay')
            allowed={canonical_action(a,s['turn']) for a in info['actions']}
            if any(int(i) not in allowed for i in np.flatnonzero(pi[index]>0)): raise ValueError('Policy assigns mass to illegal actions')
            value=0. if game['winner'] is None else 1. if s['turn']==game['winner'] else -1.
            if z[index]!=value: raise ValueError('Value label disagrees with winner')

def read_entry(directory,entry,bridge):
    directory=Path(directory)
    for field in ['replay','samples']:
        file=directory/entry[field]
        if not file.resolve().is_relative_to(directory.resolve()) or sha_file(file)!=entry[field+'Sha256']: raise ValueError('Dataset file changed or escaped directory')
    game=json.loads((directory/entry['replay']).read_text(encoding='utf-8'))
    if game['gameId']!=entry['gameId'] or game['trainingSamples']!=entry['trainingSamples']: raise ValueError('Dataset metadata mismatch')
    with np.load(directory/entry['samples'],allow_pickle=False) as data: x,pi,z=(data[k] for k in ['x','pi','z'])
    verify_game(game,x,pi,z,bridge); return list(zip(x,pi,z)),game

def load_dataset(directory,limit=None):
    directory=Path(directory); manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    if manifest['format']!=FORMAT or manifest['status']!='completed' or len(manifest['entries'])!=manifest['config']['games']: raise ValueError('Dataset collection is not complete')
    if manifest['config'].get('featureSchema')!='atlas-292-current-turn-v1': raise ValueError('Unsupported feature schema')
    if manifest['config']['wasmSha256']!=sha_file(ROOT/'public/atlas.wasm'): raise ValueError('Dataset rules artifact changed')
    if sorted(e['gameId'] for e in manifest['entries'])!=list(range(manifest['config']['games'])): raise ValueError('Missing or duplicated game IDs')
    replay=deque(maxlen=limit); bridge=Bridge()
    try:
        for entry in sorted(manifest['entries'],key=lambda e:e['gameId']): examples,_=read_entry(directory,entry,bridge); replay.extend(examples)
    finally: bridge.close()
    return list(replay),{'manifestSha256':sha_file(directory/'manifest.json'),'games':len(manifest['entries']),'samples':len(replay),'source':str(directory)}

class CollectionPaused(Exception): pass

def collect(args):
    torch.set_num_threads(args.threads)
    device='cuda' if args.device=='auto' and torch.cuda.is_available() else 'cpu' if args.device=='auto' else args.device
    if device=='cuda' and not torch.cuda.is_available(): raise RuntimeError('CUDA is unavailable; explicitly use --device cpu if intended')
    saved=torch.load(args.checkpoint,map_location='cpu',weights_only=True)
    if saved.get('format')!='atlas-training-v1' or not isinstance(saved.get('hidden'),int) or not isinstance(saved.get('iteration'),int) or saved['iteration']<0: raise ValueError('Unsupported training checkpoint')
    iteration=saved['iteration']
    model=PolicyValue(saved['hidden']).to(device); model.load_state_dict(saved['model']); model.eval()
    config={k:getattr(args,k) for k in ['games','parallel_games','rules_workers','inference_batch','simulations','max_plies','bootstrap','seed','threads']}
    config.update({'featureSchema':'atlas-292-current-turn-v1','device':device,'gpu':torch.cuda.get_device_name(0) if device=='cuda' else None,'torch':str(torch.__version__),'hidden':saved['hidden'],'iteration':iteration,'checkpointSha256':sha_file(args.checkpoint),'wasmSha256':sha_file(ROOT/'public/atlas.wasm'),'pipelineSha256':hashlib.sha256(''.join(sha_file(ROOT/p) for p in ['training/train.py','training/batch_selfplay.py','training/bridge.mjs']).encode()).hexdigest()})
    directory=Path(args.out); directory.mkdir(parents=True,exist_ok=True); manifest_path=directory/'manifest.json'
    if args.resume:
        manifest=json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest['format']!=FORMAT or manifest['config']!=config: raise ValueError('Resume configuration/model/rules/pipeline changed')
    else:
        if any(directory.iterdir()): raise ValueError('Output directory is not empty; choose a fresh directory or --resume')
        manifest={'format':FORMAT,'status':'running','config':config,'entries':[],'sessions':[]}
    (directory/'games').mkdir(exist_ok=True); (directory/'samples').mkdir(exist_ok=True)
    bridge=Bridge(); metrics={}; started=time.monotonic(); new_games=0
    try:
        done=set()
        for entry in manifest['entries']:
            if entry['gameId'] in done: raise ValueError('Duplicate completed game ID')
            read_entry(directory,entry,bridge); done.add(entry['gameId'])
        if any(i<0 or i>=args.games for i in done): raise ValueError('Invalid completed game ID')
        pending=[i for i in range(args.games) if i not in done]; manifest['status']='running'; manifest.pop('lastError',None); atomic_json(manifest_path,manifest)
        def persist(game_id,examples,game):
            nonlocal new_games
            replay=f'games/game-{game_id:06d}.json'; samples=f'samples/game-{game_id:06d}.npz'; x,pi,z=arrays(examples)
            atomic_json(directory/replay,game)
            temporary=(directory/samples).with_suffix('.npz.tmp')
            with temporary.open('wb') as stream: np.savez_compressed(stream,x=x,pi=pi,z=z); stream.flush(); os.fsync(stream.fileno())
            replace_file(temporary,directory/samples)
            manifest['entries'].append({'gameId':game_id,'replay':replay,'samples':samples,'replaySha256':sha_file(directory/replay),'samplesSha256':sha_file(directory/samples),'trainingSamples':len(examples),'reason':game['reason'],'plies':game['plies']}); atomic_json(manifest_path,manifest)
            new_games+=1; print(f'game {game_id}: {game["reason"]}, {len(examples)} samples',flush=True)
            if args.max_new_games and new_games>=args.max_new_games and len(manifest['entries'])<args.games: raise CollectionPaused()
        stream=generate_games(model,bridge,args,iteration,pending,metrics,persist)
        try:
            for _ in stream: pass
        finally: stream.close()
        manifest['status']='completed'
    except CollectionPaused: manifest['status']='partial'
    except BaseException as error:
        manifest['status']='interrupted'; manifest['lastError']=type(error).__name__; raise
    finally:
        bridge.close(); manifest['sessions'].append({'newGames':new_games,'status':manifest['status'],'errorType':manifest.get('lastError'),'elapsedSeconds':time.monotonic()-started,'metrics':metrics}); manifest['entries'].sort(key=lambda e:e['gameId']); atomic_json(manifest_path,manifest)
    return manifest

def parser():
    p=argparse.ArgumentParser(description=__doc__); p.add_argument('--checkpoint',default='models/bootstrap-checkpoint.pt'); p.add_argument('--out',default='training/runs/batched-local'); p.add_argument('--resume',action='store_true'); p.add_argument('--games',type=int,default=32); p.add_argument('--parallel-games',type=int,default=16); p.add_argument('--rules-workers',type=int,default=2); p.add_argument('--inference-batch',type=int,default=64); p.add_argument('--simulations',type=int,default=24); p.add_argument('--max-plies',type=int,default=200); p.add_argument('--bootstrap',type=float,default=.8); p.add_argument('--seed',type=int,default=271027); p.add_argument('--threads',type=int,default=2); p.add_argument('--device',choices=['auto','cpu','cuda'],default='auto'); p.add_argument('--max-new-games',type=int,default=0); return p

if __name__=='__main__':
    args=parser().parse_args()
    if not 1<=args.parallel_games<=256 or not 1<=args.rules_workers<=16 or not 1<=args.inference_batch<=512 or min(args.games,args.simulations,args.max_plies,args.threads)<1 or args.max_new_games<0 or not 0<=args.bootstrap<=1: raise ValueError('Invalid collection budget')
    result=collect(args); print(json.dumps({'status':result['status'],'games':len(result['entries']),'trainingSamples':sum(e['trainingSamples'] for e in result['entries']),'lastSession':result['sessions'][-1]},indent=2))
