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
def choose(s,allowed):
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
  agent=MCTSAgent(evaluator=evaluator,num_simulations=int(os.getenv('SIGMA_SIMS','20')),c_puct=1.2,training=False)
  root=agent.search(state)
  children=sorted(root.children,key=lambda child:child.visit_count,reverse=True)
  choices=[c for c in children if json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')) in allowed]
  if choices:
   selected=choices[0].action
   if EXPLORATION>0 and RNG.random()<EXPLORATION:
    pool=choices[:min(4,len(choices))]
    selected=RNG.choices([c.action for c in pool],weights=[max(1,c.visit_count) for c in pool])[0]
 if VARIANT=='sigma2':
  # Check the immediate forced goal before any neural selection.
  # Never replace a winning move with a wall or a quiet pawn move.
  winning=[]
  for _,a in ranked:
   move=to_action(s,a)
   if move['type']=='move' and move['y']==(0 if s['turn']==0 else 8):
    winning.append(a)
  if winning:
   selected=winning[0]
  elif len(ranked)>1:
   # An opponent one step from goal requires immediate path denial.
   # This is a tactical filter, not a heuristic for routine positions.
   from game import State as SigmaState
   opponent=1-s['turn']
   goal=8 if opponent==1 else 0
   enemy=s['p'][opponent]
   if abs(enemy['y']-goal)==1:
    defensive=[]
    for _,a in ranked:
     converted=to_action(s,a)
     if converted['type']!='wall':continue
     try:
      # Test the candidate wall geometrically after JS legality validation.
      # This only concerns a one-turn goal threat.
      from collections import deque
      walls=[{'x':w['x'],'y':w['y'],'o':w['o']} for w in s['walls']]+[converted]
      def blocked(u,v):
       return any((w['o']=='h' and u[0]==v[0] and min(u[1],v[1])==w['y'] and (u[0]==w['x'] or u[0]==w['x']+1)) or (w['o']=='v' and u[1]==v[1] and min(u[0],v[0])==w['x'] and (u[1]==w['y'] or u[1]==w['y']+1)) for w in walls)
      queue=deque([(enemy['x'],enemy['y'],0)]);seen={(enemy['x'],enemy['y'])}
      path=99
      while queue:
       x,y,d=queue.popleft()
       if y==goal:path=d;break
       for dx,dy in ((0,1),(0,-1),(1,0),(-1,0)):
        nx,ny=x+dx,y+dy
        if 0<=nx<9 and 0<=ny<9 and (nx,ny) not in seen and not blocked((x,y),(nx,ny)):
         seen.add((nx,ny));queue.append((nx,ny,d+1))
      if path>1:defensive.append(a)
     except Exception:
      pass
    if defensive:
     visitrank={json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')):c.visit_count for c in root.children} if root else {}
     selected=max(defensive,key=lambda a:visitrank.get(json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')),0))
 result={'pv':[to_action(s,selected)],'elapsedMs':(time.perf_counter()-start)*1000,'value':float(value[0][0]),'legalCount':len(actions),'mode':MODE}
 if DIAGNOSTICS:
  visits={json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')):c.visit_count for c in root.children} if root else {}
  result['diagnostics']={'topCandidates':[{'action':to_action(s,a),'policyLogit':score,'visits':visits.get(json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')),0)} for score,a in ranked[:8]],'rootValue':float(value[0][0])}
 return result
print(json.dumps({"ready":True}),flush=True)
for line in sys.stdin:
 try:
  v=json.loads(line);r=choose(v['state'],set(v['allowed']));r['id']=v.get('id');r['done']=True
 except Exception as e:r={'id':v.get('id') if 'v' in locals() else None,'done':True,'error':str(e)}
 print(json.dumps(r),flush=True)
