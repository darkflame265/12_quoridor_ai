"""CPU/GPU AlphaZero-style policy/value + PUCT loop. No trained-strength claim.

Rules are served by the independently cross-checked Rust/WASM engine. Optional
heuristic bootstrapping is explicit, annealed, and saved in every run report.
"""
import argparse
import copy
import hashlib
import json
import math
import os
from pathlib import Path
import random
import subprocess
import time
import numpy as np
import torch
from networks import PolicyValue,create_model,load_model,model_config,checkpoint_config,select_config

ROOT = Path(__file__).resolve().parents[1]
FEATURES, ACTIONS = 292, 209

def canonical_action(a, turn):
    if not turn: return a
    if a < 81: return 80-a
    k = a-81
    return 81+(64 if k >= 64 else 0)+63-k%64

def features(s):
    t=s['turn']; x=np.zeros(FEATURES,dtype=np.float32)
    for i,side in enumerate([t,1-t]):
        p=s['p'][side]; pos=p['y']*9+p['x']; x[i*81+(80-pos if t else pos)]=1
    for w in s['walls']:
        pos=w['y']*8+w['x']; pos=63-pos if t else pos
        x[162+(64 if w['o']=='v' else 0)+pos]=1
    x[290:]=[s['left'][t]/10,s['left'][1-t]/10]
    return x

def apply_action(s,a):
    n=copy.deepcopy(s); t=s['turn']
    if a<81:
        n['p'][t]={'x':a%9,'y':a//9}
        if a//9==(0 if t==0 else 8): n['winner']=t
    else:
        k=a-81; n['walls'].append({'type':'wall','x':k%8,'y':(k%64)//8,'o':'v' if k>=64 else 'h','owner':t}); n['left'][t]-=1
    n['turn']=1-t
    return n

def action_object(a):
    if a<81: return {'type':'move','x':a%9,'y':a//9}
    k=a-81; return {'type':'wall','x':k%8,'y':(k%64)//8,'o':'v' if k>=64 else 'h'}

class Bridge:
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(ROOT/'training/bridge.mjs')],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8',bufsize=1)
        self.cache={}
        self.closed=False
    def call(self,**request):
        self.proc.stdin.write(json.dumps(request,separators=(',',':'))+'\n'); self.proc.stdin.flush()
        line=self.proc.stdout.readline()
        if not line: raise RuntimeError('Rules bridge exited')
        result=json.loads(line)
        if 'error' in result: raise RuntimeError(result['error'])
        return result
    def inspect(self,s):
        key=json.dumps(s,sort_keys=True,separators=(',',':'))
        if key not in self.cache:
            if len(self.cache)>10000: self.cache.clear()
            self.cache[key]=self.call(op='inspect',state=s)
        return self.cache[key]
    def inspect_many(self,states):
        if not states: return []
        return self.call(op='inspectMany',states=states)
    def close(self):
        if self.closed: return
        self.closed=True
        try: self.proc.stdin.close()
        except (BrokenPipeError,OSError): pass
        try: self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired: self.proc.kill(); self.proc.wait()
        self.proc.stdout.close()

class Node:
    def __init__(self,state):
        self.state=state; self.actions=[]; self.prior=None; self.n=None; self.w=None; self.children={}; self.expanded=False

def expand_prediction(node,info,logits,value,bootstrap):
    """Shared legal masking and backup value for serial and batched inference."""
    s=node.state; node.actions=info['actions']
    if not node.actions: raise RuntimeError('Nonterminal position has no legal actions')
    ids=[canonical_action(a,s['turn']) for a in node.actions]
    scores=np.asarray(logits,dtype=np.float64)[ids]; scores=scores-scores.max()
    policy=np.exp(scores); policy/=policy.sum()
    policy=(1-bootstrap)*policy+bootstrap*np.asarray(info['prior'],dtype=np.float64)
    wins=[i for i,a in enumerate(node.actions) if a<81 and a//9==(0 if s['turn']==0 else 8)]
    if wins: policy.fill(0); policy[wins]=1/len(wins)
    elif len(info['unsafe'])<len(node.actions):
        unsafe=set(info['unsafe']); policy=np.asarray([p if a not in unsafe else p*1e-6 for a,p in zip(node.actions,policy)])
    total=policy.sum()
    if not np.isfinite(total) or total<=0 or not np.isfinite(value): raise RuntimeError('Non-finite network prediction')
    node.prior=policy/total; node.n=np.zeros(len(policy)); node.w=np.zeros(len(policy)); node.expanded=True
    return float(value)*(1-bootstrap*.25)+math.tanh(info['score']/700)*bootstrap*.25

class MCTS:
    def __init__(self,model,bridge,rng,simulations=24,bootstrap=0.0):
        self.model=model; self.bridge=bridge; self.rng=rng; self.simulations=simulations; self.bootstrap=bootstrap
        self.device=next(model.parameters()).device if model is not None else None
    @torch.no_grad()
    def expand(self,node):
        s=node.state
        if s['winner'] is not None: return 1.0 if s['winner']==s['turn'] else -1.0
        if self.model is None: raise RuntimeError('Batched search must be driven by an inference scheduler')
        info=self.bridge.inspect(s)
        logits,value=self.model(torch.from_numpy(features(s)).to(self.device).unsqueeze(0))
        return expand_prediction(node,info,logits[0].cpu().numpy(),value.item(),self.bootstrap)
    def search(self,s,noise=False,temperature=0):
        stream=self.search_stream(s,noise,temperature)
        try:
            node=next(stream)
            while True: node=stream.send(self.expand(node))
        except StopIteration as completed: return completed.value
    def search_stream(self,s,noise=False,temperature=0):
        """Yield one unexpanded leaf; the caller expands it and sends its value."""
        if s['winner'] is not None: raise ValueError('Cannot search a terminal position')
        root=Node(s); yield root
        if noise and len(root.actions)>1: root.prior=.85*root.prior+.15*self.rng.dirichlet(np.full(len(root.actions),.3))
        for _ in range(self.simulations):
            node=root; path=[]; seen=set()
            while node.expanded and node.state['winner'] is None:
                sig=json.dumps([node.state['p'],node.state['walls'],node.state['left'],node.state['turn']],sort_keys=True)
                if sig in seen: break
                seen.add(sig); q=np.divide(node.w,node.n,out=np.zeros_like(node.w),where=node.n>0)
                u=1.5*node.prior*math.sqrt(node.n.sum()+1)/(1+node.n)
                i=int(np.argmax(q+u)); path.append((node,i))
                if i not in node.children: node.children[i]=Node(apply_action(node.state,node.actions[i]))
                node=node.children[i]
            if node.state['winner'] is not None: value=1.0 if node.state['winner']==node.state['turn'] else -1.0
            elif node.expanded: value=0.0
            else: value=yield node
            for parent,i in reversed(path): value=-value; parent.n[i]+=1; parent.w[i]+=value
        visits=root.n/root.n.sum() if root.n.sum() else root.prior
        index=int(self.rng.choice(len(visits),p=visits)) if temperature else int(np.argmax(visits))
        target=np.zeros(ACTIONS,dtype=np.float32)
        for a,v in zip(root.actions,visits): target[canonical_action(a,s['turn'])]=v
        return root.actions[index],target

def state_key(s):
    return json.dumps([s['p'],s['left'],s['turn'],sorted((w['x'],w['y'],w['o']) for w in s['walls'])],sort_keys=True)

def selfplay(model,bridge,rng,args,iteration,game_index):
    opening=bridge.call(op='initial') if game_index%2==0 else bridge.call(op='opening',index=(iteration+game_index)%6)
    s=opening['state']; records=list(opening['records']); samples=[]; seen={}; reason='ply cap'; winner=None
    search=MCTS(model,bridge,rng,args.simulations,args.bootstrap*(.8**iteration))
    for ply in range(args.max_plies):
        key=state_key(s); seen[key]=seen.get(key,0)+1
        if seen[key]>=3: reason='repetition draw'; break
        a,pi=search.search(s,noise=True,temperature=1 if ply<8 else 0)
        samples.append((features(s),pi,s['turn'])); records.append(action_object(a)); s=apply_action(s,a)
        if s['winner'] is not None: winner=s['winner']; reason='goal reached'; break
    # Capped unfinished games are retained for diagnostics but excluded from labels.
    examples=[] if reason=='ply cap' else [(x,pi,0. if winner is None else 1. if turn==winner else -1.) for x,pi,turn in samples]
    replay=bridge.call(op='validate',records=records)['state']
    if replay!=s: raise RuntimeError('Python transition disagrees with independent rules')
    return examples,{'version':1,'records':records,'winner':winner,'reason':reason,'plies':len(samples),'trainingSamples':len(examples)}

def export_model(model,path,metadata):
    config=model_config(model)
    data={'format':'atlas-policy-value-v1' if config['type']=='mlp' else 'atlas-policy-value-rescnn-v1','features':FEATURES,'actions':ACTIONS,'hidden':model.hidden,'architecture':config,'weights':{k:v.detach().cpu().tolist() for k,v in model.state_dict().items()},'metadata':metadata}
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')

def arena(model,bridge,rng,args,opponent_model=None,split='validation'):
    bootstrap=args.bootstrap if getattr(args,'arena_bootstrap',None) is None else args.arena_bootstrap
    report={'opponent':'previous policy/value champion' if opponent_model is not None else 'Atlas 4 Rust/WASM','split':split,'ms':args.arena_ms,'simulations':args.simulations,'bootstrap':bootstrap,'games':[],'wins':0,'losses':0,'draws':0,'timing':{role:{'moves':0,'seconds':0.} for role in ['candidate','opponent']},'budgetNote':'Neural players use fixed simulations, not the reference engine time budget.'}
    for pair in range(args.arena_pairs):
        for side in [0,1]:
            opening=bridge.call(op='initial') if pair==0 else bridge.call(op='opening',index=pair%6,split=split)
            s=opening['state']; records=list(opening['records']); seen={}; winner=None; reason='ply cap'
            for ply in range(args.max_plies):
                key=state_key(s); seen[key]=seen.get(key,0)+1
                if seen[key]>=3: reason='repetition draw'; break
                role='candidate' if s['turn']==side else 'opponent'; turn_started=time.monotonic()
                if s['turn']==side: a,_=MCTS(model,bridge,rng,args.simulations,bootstrap).search(s)
                elif opponent_model is not None: a,_=MCTS(opponent_model,bridge,rng,args.simulations,bootstrap).search(s)
                else:
                    action=bridge.call(op='search',state=s,ms=args.arena_ms)['pv'][0]
                    a=action['y']*9+action['x'] if action['type']=='move' else 81+(64 if action['o']=='v' else 0)+action['y']*8+action['x']
                report['timing'][role]['moves']+=1; report['timing'][role]['seconds']+=time.monotonic()-turn_started
                records.append(action_object(a)); s=apply_action(s,a)
                if s['winner'] is not None: winner=s['winner']; reason='goal reached'; break
            outcome='draw' if winner is None else 'win' if winner==side else 'loss'
            report[{'win':'wins','loss':'losses','draw':'draws'}[outcome]]+=1
            report['games'].append({'version':1,'records':records,'candidateSide':side,'result':outcome,'reason':reason})
    n=len(report['games']); wins=report['wins']; decisive=wins+report['losses']; z=1.96
    p=wins/decisive if decisive else 0; lower=(p+z*z/(2*decisive)-z*math.sqrt(p*(1-p)/decisive+z*z/(4*decisive*decisive)))/(1+z*z/decisive) if decisive else 0
    report['promotionEligible']=n>=20 and lower>.5
    report['warning']='Small smoke arenas are not strength certification. Unfinished games are adjudicated draws for arena only. No candidate becomes default without this gate and separate tactical validation.'
    return report

def tactical_validation(model,bridge,rng,args):
    results=[]
    bootstrap=args.bootstrap if getattr(args,'arena_bootstrap',None) is None else args.arena_bootstrap
    for fixture in bridge.call(op='tactics'):
        a,_=MCTS(model,bridge,rng,args.simulations,bootstrap).search(fixture['state'])
        passed=bridge.call(op='checkTactic',id=fixture['id'],action=action_object(a))['pass']
        results.append({'id':fixture['id'],'pass':passed,'action':action_object(a)})
    return results

def run(args):
    from learner import run as learn
    return learn(args)


def parser():
    p=argparse.ArgumentParser(); p.add_argument('--out',default='training/runs/local'); p.add_argument('--resume'); p.add_argument('--champion'); p.add_argument('--iterations',type=int,default=1); p.add_argument('--games',type=int,default=4); p.add_argument('--simulations',type=int,default=24); p.add_argument('--max-plies',type=int,default=200); p.add_argument('--epochs',type=int,default=3); p.add_argument('--batch-size',type=int,default=64); p.add_argument('--replay-size',type=int,default=20000); p.add_argument('--hidden',type=int); p.add_argument('--threads',type=int,default=2); p.add_argument('--lr',type=float); p.add_argument('--seed',type=int,default=271027); p.add_argument('--bootstrap',type=float,default=.8); p.add_argument('--league-size',type=int,default=4); p.add_argument('--arena-pairs',type=int,default=2); p.add_argument('--arena-ms',type=int,default=80); p.add_argument('--arena-bootstrap',type=float); p.add_argument('--cpu',action='store_true')
    p.add_argument('--selfplay-backend',choices=['serial','batched'],default='serial'); p.add_argument('--parallel-games',type=int,default=16); p.add_argument('--rules-workers',type=int,default=2); p.add_argument('--inference-batch',type=int,default=64); p.add_argument('--replay-dir')
    p.add_argument('--architecture',choices=['mlp','rescnn']); p.add_argument('--channels',type=int); p.add_argument('--blocks',type=int); p.add_argument('--init-checkpoint'); p.add_argument('--validation-fraction',type=float); p.add_argument('--evaluation-interval',type=int,default=1); p.add_argument('--deterministic',action=argparse.BooleanOptionalAction,default=None); return p
if __name__=='__main__':
    args=parser().parse_args()
    if args.arena_bootstrap is not None and not 0<=args.arena_bootstrap<=1 or args.lr is not None and args.lr<=0 or args.evaluation_interval<1 or args.validation_fraction is not None and not 0<=args.validation_fraction<1 or args.iterations<1 or args.games<0 or args.games==0 and not (args.replay_dir or args.resume) or args.simulations<1 or args.max_plies<1 or args.epochs<1 or args.arena_pairs<1 or args.threads<1 or args.batch_size<1 or args.replay_size<1 or args.league_size<1 or not 0<=args.bootstrap<=1 or not 1<=args.parallel_games<=256 or not 1<=args.rules_workers<=16 or not 1<=args.inference_batch<=512: raise ValueError('Invalid training budget')
    run(args)
