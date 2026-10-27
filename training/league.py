"""Wall-clock policy/value league against approved Native 5.3 and past models.

Separate from training fingerprints. A passed gate selects a research champion,
never activates a neural engine in the browser.
"""
import argparse
import json
import math
from pathlib import Path
import subprocess
import time
import numpy as np
import torch
from train import ROOT,Bridge,MCTS,Node,action_object,apply_action,state_key
from networks import load_model,model_config
from batch_selfplay import atomic_json,sha_file

class NativeBridge(Bridge):
    def __init__(self):
        self.proc=subprocess.Popen(['node',str(ROOT/'training/league_bridge.mjs')],cwd=ROOT,stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True,encoding='utf-8',bufsize=1)
        self.cache={}; self.closed=False

def timed_search(model,bridge,rng,state,ms,clock=time.monotonic):
    """Stop starting expansions after deadline; finish one indivisible expansion.

    Root is always evaluated for a legal fallback. Only completed backups count.
    Timing includes rules, CPU/GPU transfers and policy inference.
    """
    started=clock(); deadline=started+ms/1000
    if state['winner'] is not None: raise ValueError('Cannot search a terminal state')
    search=MCTS(model,bridge,rng,bootstrap=0.)
    root=Node(state); search.expand(root); simulations=expansions=0
    while clock()<deadline:
        node=root; path=[]; seen=set()
        while node.expanded and node.state['winner'] is None:
            sig=state_key(node.state)
            if sig in seen: break
            seen.add(sig)
            q=np.divide(node.w,node.n,out=np.zeros_like(node.w),where=node.n>0)
            u=1.5*node.prior*math.sqrt(node.n.sum()+1)/(1+node.n)
            i=int(np.argmax(q+u)); path.append((node,i))
            if i not in node.children: node.children[i]=Node(apply_action(node.state,node.actions[i]))
            node=node.children[i]
        if node.state['winner'] is not None: value=1. if node.state['winner']==node.state['turn'] else -1.
        elif node.expanded: value=0.
        else: value=search.expand(node); expansions+=1
        for parent,i in reversed(path): value=-value; parent.n[i]+=1; parent.w[i]+=value
        simulations+=1
    visits=root.n
    index=int(np.argmax(visits if visits.sum() else root.prior))
    return root.actions[index],{'simulations':simulations,'expansions':expansions,'elapsedMs':(clock()-started)*1000}

def wilson_lower(wins,total):
    if not total: return 0.
    z=1.96; p=wins/total
    return (p+z*z/(2*total)-z*math.sqrt(p*(1-p)/total+z*z/(4*total*total)))/(1+z*z/total)

def assess(report):
    """Conservative gate: draws count against decisive superiority, not ignored."""
    checks={'completed':report.get('status')=='completed','budget':report.get('ms')==500 and report.get('cores')==4,'tactics':len(report.get('tactics',[]))==16 and all(t['pass'] for t in report.get('tactics',[]))}
    games=report.get('games',[]); opponents=report.get('opponents',[])
    checks['opponents']=len(opponents)>=2 and 'native53' in opponents and len(set(opponents))==len(opponents)
    checks['paired']=all(len([g for g in games if g['split']==split and g['opponent']==op and g['suite']==suite and g['openingIndex']==i and g['candidateSide']==side])==1 for split in ['validation','holdout'] for op in opponents for suite in ['general','maze'] for i in range(report.get('pairsPerSuite',0)) for side in [0,1]) and len(games)==report.get('pairsPerSuite',0)*8*len(opponents)
    checks['replays']=bool(games) and all(g.get('replayValidated') is True and g.get('result') in ['win','loss','draw'] for g in games)
    for split in ['validation','holdout']:
        for op in opponents:
            group=[g for g in games if g['split']==split and g['opponent']==op]
            checks[f'{split}:{op}:sample']=len(group)>=20
            checks[f'{split}:{op}:superiority']=wilson_lower(sum(g['result']=='win' for g in group),len(group))>.5
            checks[f'{split}:{op}:suites']=all(sum(g['result']=='win' for g in group if g['suite']==suite)>sum(g['result']=='loss' for g in group if g['suite']==suite) for suite in ['general','maze'])
    timing=report.get('timing',{})
    checks['deadline']=all(timing.get(role,{}).get('moves',0)>0 and timing[role]['overruns']/timing[role]['moves']<.05 for role in ['candidate',*opponents])
    checks['tacticDeadline']=all(t.get('elapsedMs',float('inf'))<=report.get('ms',0)*1.2+5 for t in report.get('tactics',[]))
    checks['splitDisjoint']=not(set(report.get('validationPositions',[]))&set(report.get('holdoutPositions',[]))) and bool(report.get('holdoutPositions'))
    return {'eligible':all(checks.values()),'checks':checks,'productionActive':False}

def source_identity():
    files=['training/league.py','training/league_bridge.mjs','training/train.py','training/networks.py','training/bridge.mjs','src/engine.js','src/search.js','src/wasm-core.js','src/wasm-node.js','server/native-process.mjs','evaluation/suite.js','evaluation/native-fixtures.mjs','evaluation/native-policy.mjs','public/atlas.wasm','evaluation/native-release.json']
    return {f:sha_file(ROOT/f) for f in files}

def run(args):
    if args.ms<1 or args.ms>30000 or args.pairs<1 or args.pairs>50 or args.max_plies<1 or args.cores not in range(1,5): raise ValueError('Invalid league budget')
    out=Path(args.out)
    if out.exists() and any(out.iterdir()): raise ValueError('Use a fresh output directory')
    out.mkdir(parents=True,exist_ok=True); (out/'games').mkdir()
    torch.set_num_threads(2); torch.manual_seed(args.seed); rng=np.random.default_rng(args.seed)
    device='cuda' if torch.cuda.is_available() and not args.cpu else 'cpu'
    files=[Path(args.candidate),*[Path(f) for f in args.opponent]]
    hashes=[sha_file(f) for f in files]
    if len(set(hashes))!=len(hashes): raise ValueError('Candidate and past models must have distinct weights files')
    models=[load_model(torch.load(f,map_location='cpu',weights_only=True),device).eval() for f in files]
    if any(not torch.isfinite(t).all() for model in models for t in model.state_dict().values()): raise ValueError('Non-finite model weights')
    # Warm inference and rules outside timed play for both neural players.
    from train import features
    rule_bridges=[Bridge() for _ in models]; rules=rule_bridges[0]; native=NativeBridge()
    report={'format':'atlas-neural-league-v1','status':'running','ms':args.ms,'cores':args.cores,'pairsPerSuite':args.pairs,'maxPlies':args.max_plies,'seed':args.seed,'device':device,'torch':str(torch.__version__),'sources':source_identity(),'candidate':{'file':str(files[0]),'sha256':hashes[0],'architecture':model_config(models[0])},'pastModels':[{'id':f'past-{i}','file':str(f),'sha256':h,'architecture':model_config(m)} for i,(f,h,m) in enumerate(zip(files[1:],hashes[1:],models[1:]))],'opponents':['native53',*[f'past-{i}' for i in range(len(files)-1)]],'games':[],'tactics':[],'timing':{},'validationPositions':[],'holdoutPositions':[],'productionActive':False,'budgetNote':'Equal requested wall-clock budgets include neural rules and transfers. One indivisible expansion may overrun; actual times and overruns are retained. No hard real-time claim.'}
    def save(): atomic_json(out/'report.json',report)
    def add_time(role,elapsed):
        t=report['timing'].setdefault(role,{'moves':0,'elapsedMs':0.,'overruns':0,'maxMs':0.}); t['moves']+=1; t['elapsedMs']+=elapsed; t['maxMs']=max(t['maxMs'],elapsed); t['overruns']+=int(elapsed>args.ms*1.2+5)
    try:
        report['native']=native.call(op='identity')
        s=native.call(op='opening',split='validation',suite='general',index=0)['state']; rules.inspect(s)
        with torch.inference_mode():
            for model in models: model(torch.from_numpy(features(s)).to(device)[None,:])
        if device=='cuda': torch.cuda.synchronize()
        for fixture in native.call(op='tactics'):
            a,stats=timed_search(models[0],rules,rng,fixture['state'],args.ms)
            report['tactics'].append({'id':fixture['id'],'pass':native.call(op='checkTactic',id=fixture['id'],action=action_object(a))['pass'],**stats})
        for split in ['validation','holdout']:
            # Holdout is not exposed to a candidate that already failed validation.
            if split=='holdout':
                probe={**report,'status':'completed'}; decision=assess(probe)
                keys=[k for k in decision['checks'] if k.startswith('validation:') or k in ['tactics','tacticDeadline','budget','opponents','deadline']]
                if not all(decision['checks'][k] for k in keys): report['holdoutSkipped']='Validation gate failed; reserved holdout not opened'; break
            for suite in ['general','maze']:
                for index in range(args.pairs):
                    opening=native.call(op='opening',split=split,suite=suite,index=index)
                    signature=state_key(opening['state']); report[split+'Positions'].append(signature)
                    if split=='holdout' and signature in report['validationPositions']: raise ValueError('Opening leakage')
                    for op in report['opponents']:
                        for side in [0,1]:
                            native.call(op='reset')
                            for bridge in rule_bridges: bridge.cache.clear()
                            state=opening['state']; records=list(opening['records']); seen={}; trace=[]; reason='ply cap'
                            for ply in range(args.max_plies):
                                key=state_key(state); seen[key]=seen.get(key,0)+1
                                if seen[key]>=3: reason='repetition draw'; break
                                role='candidate' if state['turn']==side else op; started=time.monotonic()
                                if role=='native53':
                                    action=native.call(op='search',state=state,ms=args.ms,cores=args.cores)['pv'][0]; a=action['y']*9+action['x'] if action['type']=='move' else 81+(64 if action['o']=='v' else 0)+action['y']*8+action['x']; stats={}
                                else:
                                    model_index=0 if role=='candidate' else 1+int(role.split('-')[1])
                                    a,stats=timed_search(models[model_index],rule_bridges[model_index],rng,state,args.ms); action=action_object(a)
                                elapsed=(time.monotonic()-started)*1000; add_time(role,elapsed)
                                # Independent JS transition validation happens outside the clock.
                                records.append(action); expected=apply_action(state,a); checked=native.call(op='validate',records=records)['state']
                                if checked!=expected: raise ValueError('Independent transition mismatch')
                                trace.append({'ply':ply,'role':role,'action':action,'elapsedMs':elapsed,**{k:v for k,v in stats.items() if k!='elapsedMs'}}); state=checked
                                if state['winner'] is not None: reason='goal reached'; break
                            result='draw' if state['winner'] is None else 'win' if state['winner']==side else 'loss'
                            game={'version':1,'split':split,'suite':suite,'openingIndex':index,'opponent':op,'candidateSide':side,'result':result,'winner':state['winner'],'reason':reason,'records':records,'trace':trace,'replayValidated':True}
                            name=f'{split}-{suite}-{index}-{op}-side{side}.json'; atomic_json(out/'games'/name,game)
                            report['games'].append({k:v for k,v in game.items() if k not in ['records','trace'] }|{'file':'games/'+name,'sha256':sha_file(out/'games'/name)})
                            save(); print(f'{name}: {result}, {len(trace)} plies',flush=True)
        if source_identity()!=report['sources'] or [sha_file(f) for f in files]!=hashes or native.call(op='identity')!=report['native']: raise ValueError('League inputs changed')
        report['status']='completed'; report['decision']=assess(report); save()
        # Immutable receipt for this league only. Live model/native registry untouched.
        atomic_json(out/'selection.json',{'format':'atlas-league-selection-v1','reportSha256':sha_file(out/'report.json'),'candidateSha256':hashes[0],'selected':report['decision']['eligible'],'productionActive':False})
    except BaseException as error:
        report['status']='interrupted' if isinstance(error,KeyboardInterrupt) else 'failed'; report['error']=str(error); save(); raise
    finally:
        native.close()
        for bridge in rule_bridges: bridge.close()
    return report

if __name__=='__main__':
    p=argparse.ArgumentParser(); p.add_argument('--candidate',default='models/experimental-rescnn/experimental.pt'); p.add_argument('--opponent',action='append',default=None); p.add_argument('--out',required=True); p.add_argument('--ms',type=int,default=500); p.add_argument('--cores',type=int,default=4); p.add_argument('--pairs',type=int,default=5); p.add_argument('--max-plies',type=int,default=180); p.add_argument('--seed',type=int,default=271028); p.add_argument('--cpu',action='store_true'); args=p.parse_args(); args.opponent=args.opponent or ['models/bootstrap-checkpoint.pt']; result=run(args); print(json.dumps(result['decision'],ensure_ascii=False))
