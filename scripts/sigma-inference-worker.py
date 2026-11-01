import json,sys,time,os
from pathlib import Path
import numpy as np
import onnxruntime as ort
ROOT=Path(__file__).resolve().parent.parent/'vendor/sigma-quoridor'
sys.path.insert(0,str(ROOT))
from game import State,WallAction,PawnAction,action_to_index,vert_policy_permutation
MODEL=ROOT/'models/best.onnx'
SESSION=ort.InferenceSession(str(MODEL),providers=['CPUExecutionProvider'])
PERM=vert_policy_permutation(9)
MODE=os.getenv("SIGMA_MODE","policy")
DIAGNOSTICS=os.getenv('SIGMA_DIAGNOSTICS')=='1'
EXPLORATION=float(os.getenv('SIGMA_EXPLORATION','0'))
VARIANT=os.getenv('SIGMA_VARIANT','sigma1')
import random
RNG=random.Random(int(os.getenv('SIGMA_SEED','0')))
SIGMA2_SIMS=int(os.getenv('SIGMA2_SIMS','200'))
if not 1 <= SIGMA2_SIMS <= 200:raise ValueError('Sigma2 PUCT simulations must be between 1 and 200')
SIGMA2_REUSE=os.getenv('SIGMA2_REUSE','0')=='1'
PERSISTENT_AGENT=None
if MODE=="puct":
 from mcts import MCTSAgent
 def evaluator(state,actions):
  x,v=SESSION.run(None,{"input":state.to_nn_input()[None,...].astype(np.float32)})
  z=x[0]; idx=[action_to_index(a,9) for a in actions]
  if state.depth%2:idx=[int(PERM[i]) for i in idx]
  q=z[idx].astype(np.float64);q=np.exp(q-np.max(q));q=q/max(np.sum(q),1e-10)
  return q.tolist(),float(v[0][0])
def state_of(s):
 state=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:
  a=WallAction(w['x'],7-w['y'],w['o']);state._apply_wall(a)
 state._recompute_dists()
 return state
def to_action(s,a):
 if isinstance(a,WallAction):return dict(type='wall',x=a.x,y=7-a.y,o=a.orientation)
 p=s['p'][s['turn']];return dict(type='move',x=p['x']+a.direction[0],y=p['y']-a.direction[1])
def choose(s,allowed,history=None):
 start=time.perf_counter();state=state_of(s)
 actions=state.get_legal_actions()
 if not actions:raise ValueError('No legal actions')
 logits,value=SESSION.run(None,{'input':state.to_nn_input()[None,...].astype(np.float32)})
 scores=logits[0]
 ranked=sorted(((float(scores[PERM[action_to_index(a,9)]] if s['turn'] else scores[action_to_index(a,9)]),a) for a in actions if json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')) in allowed),key=lambda x:x[0],reverse=True)
 if not ranked: raise ValueError('No Sigma action matched authoritative legal action set')
 selected=ranked[0][1]
 root=None
 if MODE=='puct':
  global PERSISTENT_AGENT
  sims=SIGMA2_SIMS if VARIANT=='sigma2' else int(os.getenv('SIGMA_SIMS','20'))
  if VARIANT=='sigma2' and SIGMA2_REUSE:
   if PERSISTENT_AGENT is None:PERSISTENT_AGENT=MCTSAgent(evaluator=evaluator,num_simulations=sims,c_puct=1.2,training=False)
   agent=PERSISTENT_AGENT
  else:agent=MCTSAgent(evaluator=evaluator,num_simulations=sims,c_puct=1.2,training=False)
  root=agent.search(state)
  children=sorted(root.children,key=lambda child:child.visit_count,reverse=True)
  choices=[c for c in children if json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')) in allowed]
  if choices:
   selected=choices[0].action
   if EXPLORATION>0 and RNG.random()<EXPLORATION:
    pool=choices[:min(4,len(choices))]
    selected=RNG.choices([c.action for c in pool],weights=[max(1,c.visit_count) for c in pool])[0]
 # Sigma 2 uses the same neural model and PUCT with more simulations;
 # no unverified tactical action overrides.
 result={'pv':[to_action(s,selected)],'elapsedMs':(time.perf_counter()-start)*1000,'value':float(value[0][0]),'legalCount':len(actions),'mode':MODE,'simulations':sims if MODE=='puct' else 0,'reusedTree':VARIANT=='sigma2' and SIGMA2_REUSE}
 if DIAGNOSTICS:
  visits={json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')):c.visit_count for c in root.children} if root else {}
  result['diagnostics']={'topCandidates':[{'action':to_action(s,a),'policyLogit':score,'visits':visits.get(json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')),0)} for score,a in ranked[:8]],'rootValue':float(value[0][0])}
 return result
print(json.dumps({"ready":True}),flush=True)
for line in sys.stdin:
 try:
  v=json.loads(line);r=choose(v['state'],set(v['allowed']),v.get('history',[]));r['id']=v.get('id');r['done']=True
 except Exception as e:r={'id':v.get('id') if 'v' in locals() else None,'done':True,'error':str(e)}
 print(json.dumps(r),flush=True)
