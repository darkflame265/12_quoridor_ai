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
from torch import nn

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
    def close(self):
        self.proc.stdin.close()
        try: self.proc.wait(timeout=3)
        except subprocess.TimeoutExpired: self.proc.kill(); self.proc.wait()
        self.proc.stdout.close()

class PolicyValue(nn.Module):
    def __init__(self,hidden=128):
        super().__init__(); self.hidden=hidden
        self.trunk=nn.Sequential(nn.Linear(FEATURES,hidden),nn.ReLU(),nn.Linear(hidden,hidden),nn.ReLU())
        self.policy=nn.Linear(hidden,ACTIONS); self.value=nn.Linear(hidden,1)
    def forward(self,x):
        h=self.trunk(x); return self.policy(h),torch.tanh(self.value(h)).squeeze(-1)

class Node:
    def __init__(self,state):
        self.state=state; self.actions=[]; self.prior=None; self.n=None; self.w=None; self.children={}; self.expanded=False

class MCTS:
    def __init__(self,model,bridge,rng,simulations=24,bootstrap=0.0):
        self.model=model; self.bridge=bridge; self.rng=rng; self.simulations=simulations; self.bootstrap=bootstrap
        self.device=next(model.parameters()).device
    @torch.no_grad()
    def expand(self,node):
        s=node.state
        if s['winner'] is not None: return 1.0 if s['winner']==s['turn'] else -1.0
        info=self.bridge.inspect(s); node.actions=info['actions']
        logits,value=self.model(torch.from_numpy(features(s)).to(self.device).unsqueeze(0))
        ids=[canonical_action(a,s['turn']) for a in node.actions]
        policy=torch.softmax(logits[0,ids],dim=0).cpu().numpy().astype(np.float64)
        policy=(1-self.bootstrap)*policy+self.bootstrap*np.asarray(info['prior'])
        # Immediate-win and immediate-loss checks are search rules, not learned labels.
        wins=[i for i,a in enumerate(node.actions) if a<81 and a//9==(0 if s['turn']==0 else 8)]
        if wins: policy.fill(0); policy[wins]=1/len(wins)
        elif len(info['unsafe'])<len(node.actions):
            unsafe=set(info['unsafe']); policy=np.asarray([p if a not in unsafe else p*1e-6 for a,p in zip(node.actions,policy)])
        policy/=policy.sum(); node.prior=policy; node.n=np.zeros(len(policy)); node.w=np.zeros(len(policy)); node.expanded=True
        return float(value.item())*(1-self.bootstrap*.25)+math.tanh(info['score']/700)*self.bootstrap*.25
    def search(self,s,noise=False,temperature=0):
        root=Node(s); self.expand(root)
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
            value=0.0 if node.expanded and node.state['winner'] is None else self.expand(node)
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
    data={'format':'atlas-policy-value-v1','features':FEATURES,'actions':ACTIONS,'hidden':model.hidden,'weights':{k:v.detach().cpu().tolist() for k,v in model.state_dict().items()},'metadata':metadata}
    path.parent.mkdir(parents=True,exist_ok=True); path.write_text(json.dumps(data,separators=(',',':')),encoding='utf-8')

def arena(model,bridge,rng,args,opponent_model=None,split='validation'):
    report={'opponent':'previous policy/value champion' if opponent_model is not None else 'Atlas 4 Rust/WASM','split':split,'ms':args.arena_ms,'simulations':args.simulations,'bootstrap':args.bootstrap,'games':[],'wins':0,'losses':0,'draws':0}
    for pair in range(args.arena_pairs):
        for side in [0,1]:
            opening=bridge.call(op='initial') if pair==0 else bridge.call(op='opening',index=pair%6,split=split)
            s=opening['state']; records=list(opening['records']); seen={}; winner=None; reason='ply cap'
            for ply in range(args.max_plies):
                key=state_key(s); seen[key]=seen.get(key,0)+1
                if seen[key]>=3: reason='repetition draw'; break
                if s['turn']==side: a,_=MCTS(model,bridge,rng,args.simulations,args.bootstrap).search(s)
                elif opponent_model is not None: a,_=MCTS(opponent_model,bridge,rng,args.simulations,args.bootstrap).search(s)
                else:
                    action=bridge.call(op='search',state=s,ms=args.arena_ms)['pv'][0]
                    a=action['y']*9+action['x'] if action['type']=='move' else 81+(64 if action['o']=='v' else 0)+action['y']*8+action['x']
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
    for fixture in bridge.call(op='tactics'):
        a,_=MCTS(model,bridge,rng,args.simulations,args.bootstrap).search(fixture['state'])
        passed=bridge.call(op='checkTactic',id=fixture['id'],action=action_object(a))['pass']
        results.append({'id':fixture['id'],'pass':passed,'action':action_object(a)})
    return results

def run(args):
    torch.set_num_threads(args.threads); torch.manual_seed(args.seed); random.seed(args.seed); rng=np.random.default_rng(args.seed)
    device='cuda' if torch.cuda.is_available() and not args.cpu else 'cpu'
    model=PolicyValue(args.hidden).to(device); optimizer=torch.optim.Adam(model.parameters(),lr=args.lr,weight_decay=1e-4)
    iteration=0; replay=[]
    if args.resume:
        saved=torch.load(args.resume,map_location=device,weights_only=True)
        if saved['format']!='atlas-training-v1' or saved['hidden']!=args.hidden: raise ValueError('Incompatible checkpoint')
        model.load_state_dict(saved['model']); optimizer.load_state_dict(saved['optimizer']); iteration=saved['iteration']; torch.set_rng_state(saved['torch_rng'].cpu()); rng.bit_generator.state=json.loads(saved['numpy_rng'])
        if device=='cuda' and saved.get('cuda_rng'):
            torch.cuda.set_rng_state_all([state.cpu() for state in saved['cuda_rng']])
        replay=list(zip(saved['x'].cpu().numpy(),saved['pi'].cpu().numpy(),saved['z'].cpu().numpy()))
    output=Path(args.out); output.mkdir(parents=True,exist_ok=True); (output/'games').mkdir(exist_ok=True)
    report={'format':'atlas-training-report-v1','device':device,'seed':args.seed,'config':vars(args),'iterations':[],'status':'running','ruleArtifactSha256':hashlib.sha256((ROOT/'public/atlas.wasm').read_bytes()).hexdigest()}
    champion=copy.deepcopy(model).eval()
    champion_path=Path(args.champion) if args.champion else output/'champion.pt'
    if champion_path.exists():
        champion_state=torch.load(champion_path,map_location=device,weights_only=True); champion.load_state_dict(champion_state['model'])
    registry=json.loads((output/'registry.json').read_text(encoding='utf-8')) if (output/'registry.json').exists() else {'active':None,'candidates':[]}
    snapshots=output/'snapshots'; snapshots.mkdir(exist_ok=True)
    if not list(snapshots.glob('*.pt')): torch.save({'model':champion.state_dict(),'hidden':args.hidden,'iteration':iteration},snapshots/f'iteration-{iteration:06d}.pt')
    bridge=Bridge(); started=time.monotonic()
    try:
        for it in range(iteration,iteration+args.iterations):
            collected=0; games=[]
            model.eval()
            for g in range(args.games):
                examples,game=selfplay(model,bridge,rng,args,it,g); replay.extend(examples); collected+=len(examples); games.append({k:v for k,v in game.items() if k!='records'})
                (output/'games'/f'iteration-{it}-game-{g}.json').write_text(json.dumps(game),encoding='utf-8'); print(f'iteration {it} game {g}: {game["reason"]}, {len(examples)} samples',flush=True)
            replay=replay[-args.replay_size:]
            if not replay: raise RuntimeError('No terminal/repetition training samples; increase simulations or max plies')
            x=torch.tensor(np.stack([v[0] for v in replay]),device=device); pi=torch.tensor(np.stack([v[1] for v in replay]),device=device); z=torch.tensor(np.asarray([v[2] for v in replay],dtype=np.float32),device=device)
            model.train(); losses=[]
            for _ in range(args.epochs):
                for ids in torch.randperm(len(replay),device=device).split(args.batch_size):
                    policy,value=model(x[ids]); loss=-(pi[ids]*torch.log_softmax(policy,dim=-1)).sum(-1).mean()+torch.mean((value-z[ids])**2)
                    optimizer.zero_grad(); loss.backward(); torch.nn.utils.clip_grad_norm_(model.parameters(),5); optimizer.step(); losses.append(float(loss.item()))
            model.eval(); entry={'iteration':it,'games':games,'collected':collected,'replaySamples':len(replay),'loss':sum(losses)/len(losses)}
            checkpoint={'format':'atlas-training-v1','hidden':args.hidden,'iteration':it+1,'model':model.state_dict(),'optimizer':optimizer.state_dict(),'torch_rng':torch.get_rng_state(),'numpy_rng':json.dumps(rng.bit_generator.state),'x':x.detach().cpu(),'pi':pi.detach().cpu(),'z':z.detach().cpu()}
            if device=='cuda': checkpoint['cuda_rng']=torch.cuda.get_rng_state_all()
            torch.save(checkpoint,output/'checkpoint.pt'); export_model(model,output/'candidate.json',{'iteration':it+1,'bootstrap':args.bootstrap,'validated':False})
            entry['arena']=arena(model,bridge,rng,args)
            entry['championArena']=arena(model,bridge,rng,args,opponent_model=champion)
            history_paths=sorted(snapshots.glob('*.pt'))
            past_state=torch.load(history_paths[it%len(history_paths)],map_location=device,weights_only=True)
            past_model=PolicyValue(args.hidden).to(device); past_model.load_state_dict(past_state['model']); past_model.eval()
            entry['historicalArena']=arena(model,bridge,rng,args,opponent_model=past_model)
            entry['historicalArena']['snapshotIteration']=past_state['iteration']
            entry['tactics']=tactical_validation(model,bridge,rng,args)
            eligible=entry['arena']['promotionEligible'] and entry['championArena']['promotionEligible'] and entry['historicalArena']['promotionEligible'] and all(t['pass'] for t in entry['tactics'])
            if eligible:
                entry['holdout']=arena(model,bridge,rng,args,split='holdout')
                eligible=entry['holdout']['promotionEligible']
            entry['promoted']=eligible
            if eligible:
                champion=copy.deepcopy(model).eval(); torch.save(checkpoint,output/'champion.pt'); export_model(model,output/'champion.json',{'iteration':it+1,'bootstrap':args.bootstrap,'validated':True})
                registry['active']='champion.json'
            registry['candidates'].append({'iteration':it+1,'promoted':eligible,'baseline':{k:entry['arena'][k] for k in ['wins','losses','draws']}})
            (output/'registry.json').write_text(json.dumps(registry,indent=2),encoding='utf-8')
            torch.save({'model':model.state_dict(),'hidden':args.hidden,'iteration':it+1},snapshots/f'iteration-{it+1:06d}.pt')
            for old in sorted(snapshots.glob('*.pt'))[:-args.league_size]: old.unlink()
            # Candidate artifacts are retained regardless of arena result; no unverified model is activated.
            report['iterations'].append(entry); report['elapsedSeconds']=time.monotonic()-started
            (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
            print(f'iteration {it}: loss={entry["loss"]:.4f}, arena {entry["arena"]["wins"]}W/{entry["arena"]["losses"]}L/{entry["arena"]["draws"]}D',flush=True)
        report['status']='completed'; (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8')
    except KeyboardInterrupt:
        report['status']='interrupted'; (output/'report.json').write_text(json.dumps(report,indent=2),encoding='utf-8'); raise
    finally: bridge.close()

def parser():
    p=argparse.ArgumentParser(); p.add_argument('--out',default='training/runs/local'); p.add_argument('--resume'); p.add_argument('--champion'); p.add_argument('--iterations',type=int,default=1); p.add_argument('--games',type=int,default=4); p.add_argument('--simulations',type=int,default=24); p.add_argument('--max-plies',type=int,default=200); p.add_argument('--epochs',type=int,default=3); p.add_argument('--batch-size',type=int,default=64); p.add_argument('--replay-size',type=int,default=20000); p.add_argument('--hidden',type=int,default=128); p.add_argument('--threads',type=int,default=2); p.add_argument('--lr',type=float,default=1e-3); p.add_argument('--seed',type=int,default=271027); p.add_argument('--bootstrap',type=float,default=.8); p.add_argument('--league-size',type=int,default=4); p.add_argument('--arena-pairs',type=int,default=2); p.add_argument('--arena-ms',type=int,default=80); p.add_argument('--cpu',action='store_true'); return p
if __name__=='__main__':
    args=parser().parse_args()
    if args.iterations<1 or args.games<1 or args.simulations<1 or args.max_plies<1 or args.epochs<1 or args.arena_pairs<1 or args.threads<1 or args.batch_size<1 or args.replay_size<1 or args.league_size<1 or not 0<=args.bootstrap<=1: raise ValueError('Invalid training budget')
    run(args)
