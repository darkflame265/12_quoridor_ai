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
  # Tactical safety: take an immediate legal goal, otherwise avoid a
  # zero-impact wall when a visited pawn move makes real path progress.
  goal=0 if s['turn']==0 else 8
  win=[a for _,a in ranked if to_action(s,a)['type']=='move' and to_action(s,a)['y']==goal]
  if win:
   selected=win[0]
  elif MODE=='puct' and root is not None:
   # Sigma 2 only: use Sigma's complete legal pawn generation (including
   # jumps and diagonal contact) to evaluate a forced opponent goal.
   # Evaluate all root actions, then preserve PUCT visit ordering among safe
   # replies. This avoids relying on vertical-step-only heuristics.
   def pawn_at_goal_after(next_state,action):
    if not isinstance(action,PawnAction):return False
    resulting=next_state.next(action)
    if next_state.is_player1_turn():
     return resulting.player1pos[1]==8
    return resulting.player2pos[1]==0
   def gives_opponent_goal(root_action):
    after=state.next(root_action)
    return any(pawn_at_goal_after(after,reply) for reply in after.get_legal_actions() if isinstance(reply,PawnAction))
   selected_child=next((c for c in choices if c.action==selected),None)
   if selected_child is not None and gives_opponent_goal(selected):
    safe_children=[c for c in choices if not gives_opponent_goal(c.action)]
    if safe_children:
     selected=max(safe_children,key=lambda c:c.visit_count).action
   proposed=to_action(s,selected)
   if proposed['type']=='wall':
    from collections import deque
    def pathlen(player,additional=None):
     walls=s['walls']+([additional] if additional else [])
     p=s['p'][player];target=0 if player==0 else 8
     q=deque([(p['x'],p['y'],0)]);seen={(p['x'],p['y'])}
     while q:
      x,y,d=q.popleft()
      if y==target:return d
      for dx,dy in ((0,1),(0,-1),(1,0),(-1,0)):
       nx,ny=x+dx,y+dy
       if not (0<=nx<9 and 0<=ny<9) or (nx,ny) in seen:continue
       blocked=any((w['o']=='h' and x==nx and min(y,ny)==w['y'] and x in (w['x'],w['x']+1)) or (w['o']=='v' and y==ny and min(x,nx)==w['x'] and y in (w['y'],w['y']+1)) for w in walls)
       if not blocked:seen.add((nx,ny));q.append((nx,ny,d+1))
     return 100
    own=s['turn'];opp=1-own
    baseOwn=pathlen(own);baseOpp=pathlen(opp)
    wallImpact=(pathlen(opp,proposed)-baseOpp)-(pathlen(own,proposed)-baseOwn)
    if wallImpact<=0:
     visited=sorted(root.children,key=lambda c:c.visit_count,reverse=True)
     for child in visited:
      candidate=to_action(s,child.action)
      if candidate['type']!='move':continue
      if json.dumps(candidate,sort_keys=True,separators=(',',':')) not in allowed:continue
      nextState=dict(s,p=[dict(p) for p in s['p']]);nextState['p'][own]=dict(x=candidate['x'],y=candidate['y'])
      # Prefer moving only if it strictly reduces the shortest route,
      # and PUCT actually visited the alternative.
      sSaved=s;s=nextState
      after=pathlen(own)
      s=sSaved
      if after<baseOwn and child.visit_count>=2:
       selected=child.action;break
 result={'pv':[to_action(s,selected)],'elapsedMs':(time.perf_counter()-start)*1000,'value':float(value[0][0]),'legalCount':len(actions),'mode':MODE}
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
