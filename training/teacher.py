"""Native 5.3 demonstrations, leakage-free splits and supervised CNN refinement.

Policy targets are teacher actions, not MCTS visit distributions. Value targets
explicitly blend actual outcomes with a heuristic teacher score; not probabilities.
"""
import argparse
import copy
import hashlib
import json
import math
from pathlib import Path
import random
import time
import numpy as np
import torch
from train import ROOT,Bridge,features,canonical_action,apply_action,action_object,state_key
from league import NativeBridge,source_identity
from networks import load_model,model_config
from learner import snapshot,save_torch
from batch_selfplay import atomic_json,sha_file

def identity():
    return source_identity()|{f:sha_file(ROOT/f) for f in ['training/teacher.py','training/learner.py','training/batch_selfplay.py']}

def action_id(a): return a['y']*9+a['x'] if a['type']=='move' else 81+(64 if a['o']=='v' else 0)+a['y']*8+a['x']

def outcome(winner,turn): return 0. if winner is None else 1. if winner==turn else -1.

def mirror(x,a,mask):
    y=x.copy(); y[:162]=x[:162].reshape(2,9,9)[:,:,::-1].reshape(-1); y[162:290]=x[162:290].reshape(2,8,8)[:,:,::-1].reshape(-1)
    def flip(i):
        if i<81: return (i//9)*9+8-i%9
        k=i-81; return 81+(64 if k>=64 else 0)+(k%64//8)*8+7-k%8
    m=np.zeros(209,dtype=np.bool_)
    for i in np.flatnonzero(mask): m[flip(int(i))]=True
    return y,flip(a),m

def collect(args):
    if not 4<=args.games<=100 or args.ms<1 or args.ms>30000 or args.cores not in range(1,5) or args.max_plies<1: raise ValueError('Invalid collection budget')
    out=Path(args.out); config={k:getattr(args,k) for k in ['games','ms','cores','max_plies']}
    if out.exists() and any(out.iterdir()) and not args.resume: raise ValueError('Use a fresh directory or --resume')
    out.mkdir(parents=True,exist_ok=True); (out/'games').mkdir(exist_ok=True)
    path=out/'manifest.json'; bridge=NativeBridge(); started=time.monotonic()
    try:
        native=bridge.call(op='identity'); sources=identity()
        if args.resume:
            manifest=json.loads(path.read_text(encoding='utf-8'))
            if manifest['config']!=config or manifest['sources']!=sources or manifest['native']!=native: raise ValueError('Teacher resume inputs changed')
            for e in manifest['entries']:
                if sha_file(out/e['file'])!=e['sha256']: raise ValueError('Teacher replay changed')
        else: manifest={'format':'atlas-native-teacher-v1','status':'running','config':config,'sources':sources,'native':native,'split':'development only','entries':[],'sessions':[]}
        done={e['id'] for e in manifest['entries']}; manifest['status']='running'; atomic_json(path,manifest)
        for i in range(args.games):
            if i in done: continue
            suite='general' if i%2==0 else 'maze'; index=i//2
            opening=bridge.call(op='opening',split='development',suite=suite,index=index); bridge.call(op='reset')
            state=opening['state']; records=list(opening['records']); trace=[]; seen={}; reason='ply cap'
            for ply in range(args.max_plies):
                key=state_key(state); seen[key]=seen.get(key,0)+1
                if seen[key]>=3: reason='repetition draw'; break
                start=time.monotonic(); r=bridge.call(op='search',state=state,ms=args.ms,cores=args.cores); elapsed=(time.monotonic()-start)*1000; action=r['pv'][0]
                if not math.isfinite(r['score']): raise ValueError('Invalid teacher score')
                trace.append({'action':action,'score':r['score'],'depth':r['depth'],'elapsedMs':elapsed}); records.append(action); state=apply_action(state,action_id(action))
                if state['winner'] is not None: reason='goal reached'; break
            if bridge.call(op='validate',records=records)['state']!=state: raise ValueError('Teacher transition mismatch')
            game={'version':1,'id':i,'suite':suite,'openingIndex':index,'openingPlies':len(opening['records']),'records':records,'trace':trace,'winner':state['winner'],'reason':reason,'trainingSamples':0 if reason=='ply cap' else len(trace)}
            file=f'games/game-{i:04d}.json'; atomic_json(out/file,game); manifest['entries'].append({'id':i,'file':file,'sha256':sha_file(out/file),'suite':suite,'reason':reason,'samples':game['trainingSamples']}); atomic_json(path,manifest)
            print(f'teacher {i}: {suite}, {reason}, {len(trace)} plies',flush=True)
        if identity()!=sources or bridge.call(op='identity')!=native: raise ValueError('Teacher inputs changed')
        manifest['status']='completed'
    except BaseException:
        if 'manifest' in locals(): manifest['status']='interrupted'
        raise
    finally:
        bridge.close()
        if 'manifest' in locals(): manifest['sessions'].append({'seconds':time.monotonic()-started,'status':manifest['status']}); atomic_json(path,manifest)
    return manifest

def load_data(directory,value_blend):
    directory=Path(directory); manifest=json.loads((directory/'manifest.json').read_text(encoding='utf-8'))
    if manifest['format']!='atlas-native-teacher-v1' or manifest['status']!='completed' or len(manifest['entries'])!=manifest['config']['games']: raise ValueError('Incomplete teacher dataset')
    if len({e['id'] for e in manifest['entries']})!=len(manifest['entries']): raise ValueError('Duplicate teacher game')
    bridge=Bridge(); groups=[]
    try:
        initial=bridge.call(op='initial')['state']
        for e in manifest['entries']:
            path=(directory/e['file']).resolve()
            if directory.resolve() not in path.parents or sha_file(path)!=e['sha256']: raise ValueError('Teacher replay changed')
            game=json.loads(path.read_text(encoding='utf-8')); state=copy.deepcopy(initial); rows=[]; prefix=game['openingPlies']
            if len(game['trace'])!=len(game['records'])-prefix or game['id']!=e['id']: raise ValueError('Invalid teacher trace')
            for a in game['records'][:prefix]: state=apply_action(state,action_id(a))
            for t,a in zip(game['trace'],game['records'][prefix:]):
                if t['action']!=a or not math.isfinite(t['score']): raise ValueError('Invalid teacher labels')
                info=bridge.inspect(state); mask=np.zeros(209,dtype=np.bool_); mask[[canonical_action(i,state['turn']) for i in info['actions']]]=True
                target=canonical_action(action_id(a),state['turn'])
                if not mask[target]: raise ValueError('Illegal teacher policy')
                z=outcome(game['winner'],state['turn']); soft=(1-value_blend)*z+value_blend*math.tanh(t['score']/700)
                rows.append((features(state),target,mask,soft,z)); state=apply_action(state,action_id(a))
            if bridge.call(op='validate',records=game['records'])['state']!=state or state['winner']!=game['winner']: raise ValueError('Teacher outcome mismatch')
            expected=0 if game['reason']=='ply cap' else len(rows)
            if expected!=game['trainingSamples'] or expected!=e['samples']: raise ValueError('Teacher sample mismatch')
            groups.append({'id':e['id'],'suite':game['suite'],'rows':rows if expected else []})
    finally: bridge.close()
    return manifest,groups

def split_data(groups,seed,fraction):
    rng=np.random.default_rng(seed); held=set()
    for suite in ['general','maze']:
        ids=[g['id'] for g in groups if g['suite']==suite and g['rows']]
        if len(ids)<2: raise ValueError('Need at least two completed games per suite')
        held.update(rng.permutation(ids)[:max(1,min(len(ids)-1,round(len(ids)*fraction)))].tolist())
    validation=[r for g in groups if g['id'] in held for r in g['rows']]
    reserved={x.tobytes() for r in validation for x in [r[0],mirror(r[0],r[1],r[2])[0]]}
    training=[r for g in groups if g['id'] not in held for r in g['rows'] if r[0].tobytes() not in reserved]
    augmented=[]
    for x,a,m,z,o in training:
        augmented.extend([(x,a,m,z,o),(*mirror(x,a,m),z,o)])
    if not augmented: raise ValueError('No disjoint training states')
    return augmented,validation,{'validationGames':sorted(held),'validationSamples':len(validation),'trainingOriginalSamples':len(training),'trainingAugmentedSamples':len(augmented),'excludedOverlappingStates':sum(len(g['rows']) for g in groups if g['id'] not in held)-len(training),'mirrorAwareOverlap':len({r[0].tobytes() for r in augmented}&reserved)}

def tensors(rows,device):
    return tuple(torch.from_numpy(np.asarray([r[i] for r in rows],dtype=dtype)).to(device) for i,dtype in enumerate([np.float32,np.int64,np.bool_,np.float32,np.float32]))

@torch.inference_mode()
def metrics(model,rows):
    model.eval(); x,a,m,z,o=tensors(rows,next(model.parameters()).device); totals=np.zeros(5)
    for ids in torch.arange(len(x),device=x.device).split(256):
        logits,value=model(x[ids]); logits=logits.masked_fill(~m[ids],-1e9)
        totals+=np.array([torch.nn.functional.cross_entropy(logits,a[ids],reduction='sum').item(),((value-z[ids])**2).sum().item(),((value-o[ids])**2).sum().item(),(logits.argmax(-1)==a[ids]).sum().item(),(o[ids]**2).sum().item()])
    p,v,o,acc,zero=(totals/len(rows)).tolist(); return {'policyLoss':p,'valueTargetMse':v,'outcomeMse':o,'teacherTop1':acc,'zeroOutcomeMse':zero,'loss':p+v}

def fit(args):
    if args.epochs<1 or args.batch_size<1 or args.lr<=0 or not 0<=args.value_blend<=1 or not 0<args.validation_fraction<1: raise ValueError('Invalid training options')
    out=Path(args.out)
    if out.exists() and any(out.iterdir()): raise ValueError('Use a fresh training directory')
    torch.set_num_threads(2); torch.manual_seed(args.seed); np.random.seed(args.seed); random.seed(args.seed)
    device='cuda' if torch.cuda.is_available() and not args.cpu else 'cpu'
    model=load_model(torch.load(args.checkpoint,map_location='cpu',weights_only=True),device)
    manifest,groups=load_data(args.dataset,args.value_blend); train,validation,split=split_data(groups,args.seed,args.validation_fraction)
    inputs={'sources':identity(),'datasetSha256':sha_file(Path(args.dataset)/'manifest.json'),'initialCheckpointSha256':sha_file(args.checkpoint)}
    out.mkdir(parents=True); report={'format':'atlas-teacher-training-v1','status':'running','config':vars(args),'device':device,'torch':str(torch.__version__),'architecture':model_config(model),'inputs':inputs,'split':split,'before':{'train':metrics(model,train),'validation':metrics(model,validation)},'epochs':[],'productionActive':False,'valueTargetNote':'Blended final result and tanh(Native score / 700). Heuristic distillation target, not calibrated win probability.'}
    optimizer=torch.optim.Adam(model.parameters(),lr=args.lr,weight_decay=1e-4); data=tensors(train,device); best=report['before']['validation']['loss']; best_epoch=0
    save_torch(out/'best.pt',snapshot(model,0)); atomic_json(out/'report.json',report)
    try:
        for epoch in range(args.epochs):
            model.train(); x,a,m,z,o=data
            for ids in torch.randperm(len(x),device=device).split(args.batch_size):
                logits,value=model(x[ids]); loss=torch.nn.functional.cross_entropy(logits.masked_fill(~m[ids],-1e9),a[ids])+((value-z[ids])**2).mean()
                if not torch.isfinite(loss): raise ValueError('Non-finite teacher loss')
                optimizer.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),5); optimizer.step()
            row={'epoch':epoch+1,'train':metrics(model,train),'validation':metrics(model,validation)}; report['epochs'].append(row)
            if row['validation']['loss']<best: best=row['validation']['loss']; best_epoch=epoch+1; save_torch(out/'best.pt',snapshot(model,best_epoch))
            save_torch(out/'checkpoint.pt',snapshot(model,epoch+1)|{'optimizer':optimizer.state_dict(),'torch_rng':torch.get_rng_state(),'inputs':inputs})
            atomic_json(out/'report.json',report); print(f'teacher epoch {epoch+1}: validation {row["validation"]["loss"]:.4f}',flush=True)
        if identity()!=inputs['sources'] or sha_file(Path(args.dataset)/'manifest.json')!=inputs['datasetSha256'] or sha_file(args.checkpoint)!=inputs['initialCheckpointSha256']: raise ValueError('Training inputs changed')
        report['bestEpoch']=best_epoch; report['bestLoss']=best; report['bestSha256']=sha_file(out/'best.pt'); report['status']='completed'; atomic_json(out/'report.json',report)
    except BaseException:
        report['status']='interrupted'; atomic_json(out/'report.json',report); raise
    return report

def export(args):
    directory=Path(args.out); source=Path(args.run); report_path=source/'report.json'; report=json.loads(report_path.read_text(encoding='utf-8'))
    if report['status']!='completed' or report['inputs']['sources']!=identity() or report['bestSha256']!=sha_file(source/'best.pt'): raise ValueError('Incomplete or changed teacher run')
    if directory.resolve()==(ROOT/'models').resolve() or directory.exists() and any(directory.iterdir()): raise ValueError('Use a fresh experimental model directory')
    saved=torch.load(source/'best.pt',map_location='cpu',weights_only=True); model=load_model(saved).eval()
    if any(not torch.isfinite(v).all() for v in model.state_dict().values()): raise ValueError('Invalid model')
    directory.mkdir(parents=True,exist_ok=True); save_torch(directory/'experimental.pt',saved)
    atomic_json(directory/'metadata.json',{'format':'atlas-teacher-experiment-v1','sha256':sha_file(directory/'experimental.pt'),'architecture':model_config(model),'selectedEpoch':report['bestEpoch'],'trainingReportSha256':sha_file(report_path),'sourceBestSha256':report['bestSha256'],'productionActive':False})

def parser():
    p=argparse.ArgumentParser(); sub=p.add_subparsers(dest='command',required=True)
    c=sub.add_parser('collect'); c.add_argument('--out',required=True); c.add_argument('--games',type=int,default=32); c.add_argument('--ms',type=int,default=30); c.add_argument('--cores',type=int,default=4); c.add_argument('--max-plies',type=int,default=160); c.add_argument('--resume',action='store_true')
    f=sub.add_parser('fit'); f.add_argument('--dataset',required=True); f.add_argument('--out',required=True); f.add_argument('--checkpoint',default='models/experimental-rescnn/experimental.pt'); f.add_argument('--epochs',type=int,default=20); f.add_argument('--batch-size',type=int,default=64); f.add_argument('--lr',type=float,default=.0003); f.add_argument('--seed',type=int,default=271029); f.add_argument('--validation-fraction',type=float,default=.2); f.add_argument('--value-blend',type=float,default=.5); f.add_argument('--cpu',action='store_true')
    e=sub.add_parser('export'); e.add_argument('--run',required=True); e.add_argument('--out',required=True)
    return p

if __name__=='__main__':
    args=parser().parse_args(); {'collect':collect,'fit':fit,'export':export}[args.command](args)
