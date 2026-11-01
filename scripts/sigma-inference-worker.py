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
if MODE=='puct':
 class Sigma2LoopAwareMCTS(MCTSAgent):
  historical_keys=frozenset()
  # Treat repeated full positions inside a simulated principal line as a
  # drawn continuation. Counts against the same 200-simulation budget.
  def _run_simulation(self,root):
   node=root
   seen=set()
   while True:
    node.ensure_state()
    key=node.state._position_key()
    if key in seen or (node is not root and key in self.historical_keys):
     self._backup(node,0.0)
     return
    seen.add(key)
    if not node.is_expanded or node.state.is_finished():break
    node=node.best_child(self.c_puct,self.fpu_reduction)
   if node.state.is_finished():value=self._terminal_value(node.state)
   else:value=self._expand(node)
   self._backup(node,value)

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
   if PERSISTENT_AGENT is None:PERSISTENT_AGENT=Sigma2LoopAwareMCTS(evaluator=evaluator,num_simulations=sims,c_puct=1.2,training=False)
   agent=PERSISTENT_AGENT
  else:agent=(Sigma2LoopAwareMCTS if VARIANT=='sigma2' else MCTSAgent)(evaluator=evaluator,num_simulations=sims,c_puct=1.2,training=False)
  if VARIANT=='sigma2':
   # The root state itself is always in real-game history; only newly
   # reached descendants may be scored as repeated drawn positions.
   prior_states=[h['state'] for h in (history or []) if isinstance(h,dict) and 'state' in h]
   agent.historical_keys=frozenset(state_of(v)._position_key() for v in prior_states)
  root=agent.search(state)
  children=sorted(root.children,key=lambda child:child.visit_count,reverse=True)
  choices=[c for c in children if json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')) in allowed]
  if choices:
   selected=choices[0].action
   if EXPLORATION>0 and RNG.random()<EXPLORATION:
    pool=choices[:min(4,len(choices))]
    selected=RNG.choices([c.action for c in pool],weights=[max(1,c.visit_count) for c in pool])[0]
 dbg={}
 if VARIANT=='sigma2' and MODE=='puct' and choices:
  # Choose only similarly visited candidates and discourage exact full-state loops.
  ply=int(s.get('ply',0))
  close=[c for c in choices if c.visit_count>=max(3,choices[0].visit_count*0.72)]
  if not close:close=[choices[0]]
  danger=False
  if history:
   def state_key(v):
    return (tuple((p['x'],p['y']) for p in v['p']),tuple(sorted((w['x'],w['y'],w['o']) for w in v['walls'])),tuple(v['left']),v['turn'])
   repeats={state_key(h['state']) for h in history if 'state' in h}
   fresh=[]
   for c in close:
    a=to_action(s,c.action)
    nxt={'p':[dict(p) for p in s['p']],'walls':list(s['walls']),'left':list(s['left']),'turn':1-s['turn']}
    if a['type']=='move':nxt['p'][s['turn']]={'x':a['x'],'y':a['y']}
    else:
     nxt['walls'].append(a);nxt['left'][s['turn']]-=1
    if state_key(nxt) not in repeats:fresh.append(c)
   if fresh:close=fresh
  # Real-game progress screening: full-board repetition alone cannot catch
  # d7-c7 toggling while the opponent changes position or wall geometry.
  # Restrict screening to strong candidates; never force an unsearched move.
  own=s['turn']
  recent=[h['state'] for h in (history or []) if 'state' in h and h['state']['turn']==own]
  if len(recent)>=2:
   ownpos=lambda v:(v['p'][own]['x'],v['p'][own]['y'])
   previous={ownpos(v) for v in recent[-8:]}
   # Compare real historical race progress using the Sigma engine's wall
   # distance grids; future board geometry can differ from earlier states.
   now_own=state.p1_dist[state.player1pos[1]][state.player1pos[0]] if own==0 else state.p2_dist[state.player2pos[1]][state.player2pos[0]]
   prior_dist=[]
   for old in recent[-8:]:
    oldstate=state_of(old)
    pos=oldstate.player1pos if own==0 else oldstate.player2pos
    grid=oldstate.p1_dist if own==0 else oldstate.p2_dist
    prior_dist.append(grid[pos[1]][pos[0]])
   best_dist=min([now_own]+prior_dist)
   # Opponent progress can make a retreat especially costly.
   first=state_of(recent[max(0,len(recent)-8)])
   other=1-own
   startpos=first.player1pos if other==0 else first.player2pos
   curpos=state.player1pos if other==0 else state.player2pos
   oldgrid=first.p1_dist if other==0 else first.p2_dist
   newgrid=state.p1_dist if other==0 else state.p2_dist
   opponent_advanced=newgrid[curpos[1]][curpos[0]]<oldgrid[startpos[1]][startpos[0]]
   dbg.update(recent=len(recent),previous=list(previous),best=best_dist,opponent_advanced=opponent_advanced,leader=to_action(s,choices[0].action))
   if opponent_advanced or len(recent)>=3:
    # If the leading move is a no-progress return, inspect sufficiently
    # explored alternatives even below the normal 72% diversity window.
    # This only widens the candidate window; it never increases MCTS sims.
    leader=to_action(s,choices[0].action)
    danger=False
    if leader['type']=='move' and (leader['x'],leader['y']) in previous:
     leader_state=state.next(choices[0].action)
     pos=leader_state.player1pos if own==0 else leader_state.player2pos
     grid=leader_state.p1_dist if own==0 else leader_state.p2_dist
     danger=grid[pos[1]][pos[0]]>=best_dist
    dbg['danger']=danger
    if danger:
     widened=[c for c in choices if c.visit_count>=max(2,choices[0].visit_count*0.25)]
     if widened:close=widened
    fresh=[]
    for c in close:
     a=to_action(s,c.action)
     if a['type']!='move' or (a['x'],a['y']) not in previous:
      fresh.append(c);continue
     afterstate=state.next(c.action)
     p=afterstate.player1pos if own==0 else afterstate.player2pos
     g=afterstate.p1_dist if own==0 else afterstate.p2_dist
     if g[p[1]][p[0]]<best_dist:fresh.append(c)
    if fresh:close=fresh
    dbg['afterFilter']=[to_action(s,c.action) for c in close[:5]]
  winning=[c for c in close if to_action(s,c.action)['type']=='move' and to_action(s,c.action)['y']==(0 if s['turn']==0 else 8)]
  if winning:selected=winning[0].action
  elif danger and close:selected=close[0].action
  elif len(close)>1 and ply<44:
   temp=0.65 if ply<20 else 0.35
   selected=RNG.choices(close,weights=[max(1,c.visit_count)**(1/temp) for c in close],k=1)[0].action
  else:selected=close[0].action

 result={'pv':[to_action(s,selected)],'elapsedMs':(time.perf_counter()-start)*1000,'value':float(value[0][0]),'legalCount':len(actions),'mode':MODE,'simulations':sims if MODE=='puct' else 0,'reusedTree':VARIANT=='sigma2' and SIGMA2_REUSE}
 if DIAGNOSTICS:
  visits={json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')):c.visit_count for c in root.children} if root else {}
  result['diagnostics']={'loopDebug':dbg,'topCandidates':[{'action':to_action(s,a),'policyLogit':score,'visits':visits.get(json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')),0)} for score,a in ranked[:8]],'rootValue':float(value[0][0])}
 return result
print(json.dumps({"ready":True}),flush=True)
for line in sys.stdin:
 try:
  v=json.loads(line);r=choose(v['state'],set(v['allowed']),v.get('history',[]));r['id']=v.get('id');r['done']=True
 except Exception as e:
  import traceback
  traceback.print_exc(file=sys.stderr)
  r={'id':v.get('id') if 'v' in locals() else None,'done':True,'error':str(e)}
 print(json.dumps(r),flush=True)
