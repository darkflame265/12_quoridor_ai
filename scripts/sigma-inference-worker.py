import json,sys,time,os
from pathlib import Path
import numpy as np
import onnxruntime as ort
ROOT=Path(__file__).resolve().parent.parent/'vendor/sigma-quoridor'
sys.path.insert(0,str(ROOT))
from game import State,WallAction,PawnAction,action_to_index,vert_policy_permutation
from sigma_search_runtime import serve, timed_search, remember_candidate, install_checkpoints, checkpoint
from sigma_fast_walls import install_fast_walls
install_fast_walls(State)
install_checkpoints(State)
MODEL=ROOT/'models/best.onnx'
from sigma_inference_cache import CachedInference
SESSION=CachedInference(ort.InferenceSession(str(MODEL),providers=['CPUExecutionProvider']))
PERM=vert_policy_permutation(9)
MODE=os.getenv("SIGMA_MODE","policy")
DIAGNOSTICS=os.getenv('SIGMA_DIAGNOSTICS')=='1'
EXPLORATION=float(os.getenv('SIGMA_EXPLORATION','0'))
VARIANT=os.getenv('SIGMA_VARIANT','sigma1')
import random
RNG=random.Random(int(os.getenv('SIGMA_SEED','0')))
SIGMA3_TACTICAL_PROOF=os.getenv('SIGMA3_TACTICAL_PROOF','0')=='1'
SIGMA3_ATTACK_PROOF=os.getenv('SIGMA3_ATTACK_PROOF','0')=='1'
SIGMA3_MIDGAME_STRESS=os.getenv('SIGMA3_MIDGAME_STRESS','0')=='1'
SIGMA2_SIMS=int(os.getenv('SIGMA2_SIMS','200'))
# Offline research-only search. Production games still use the 200-sim cap.
SIGMA3_RESEARCH_SIMS=int(os.getenv('SIGMA3_RESEARCH_SIMS','0'))
if SIGMA3_RESEARCH_SIMS and not (VARIANT=='sigma3' and 200<=SIGMA3_RESEARCH_SIMS<=5000):
 raise ValueError('Offline Sigma3 research simulations must be 200..5000')
if not 1 <= SIGMA2_SIMS <= 200:raise ValueError('Sigma2 PUCT simulations must be between 1 and 200')
SIGMA2_REUSE=os.getenv('SIGMA2_REUSE','1')=='1'
# Keep unproven one-reply counterfactual overrides opt-in until deeper
# continuations and matched-pair tournament evidence support them.
SIGMA2_ONE_REPLY_OVERRIDE=os.getenv('SIGMA2_ONE_REPLY_OVERRIDE','0')=='1'
SIGMA2_PREVENTIVE_WALL_OVERRIDE=os.getenv('SIGMA2_PREVENTIVE_WALL_OVERRIDE','0')=='1'
SIGMA2_PRECOMMIT_RETREAT=os.getenv('SIGMA2_PRECOMMIT_RETREAT','0')=='1'
SIGMA2_WALL_VALUE_CHECK=os.getenv('SIGMA2_WALL_VALUE_CHECK','1')=='1'
SIGMA2_STRICT_CYCLE_VALUE=os.getenv('SIGMA2_STRICT_CYCLE_VALUE','0')=='1'
SIGMA2_DETERMINISTIC=os.getenv('SIGMA2_DETERMINISTIC','0')=='1'
SIGMA2_CPUCT=float(os.getenv('SIGMA2_CPUCT','0.60'))
SIGMA2_CLOSE_RATIO=float(os.getenv('SIGMA2_CLOSE_RATIO','0.88'))
SIGMA2_CHOICE_TEMP=float(os.getenv('SIGMA2_CHOICE_TEMP','0.20'))
if not 0.1 <= SIGMA2_CHOICE_TEMP <= 1.0:raise ValueError('Sigma2 choice temperature out of range')
if not 0.3 <= SIGMA2_CPUCT <= 3.0:raise ValueError('Sigma2 PUCT constant must be in [0.3,3.0]')
PERSISTENT_AGENT=None
if MODE=="puct":
 from mcts import MCTSAgent
 from sigma3_tactical import enemy_two_turn_force
 from sigma3_attack import find_forced_goal_two_turns,find_forced_three_turn_race
 from sigma3_midgame import root_stress_guard
 def evaluator(state,actions):
  checkpoint()
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
     # In a winning race, stalling is worse than a neutral continuation.
     # Preserve neutral loop value if the root is not clearly ahead, so
     # defensive repetitions remain possible when avoiding a worse loss.
     r=root.state
     current=r.get_current_player()
     own=r.player1pos if current==1 else r.player2pos
     other=r.player2pos if current==1 else r.player1pos
     own_grid=r.p1_dist if current==1 else r.p2_dist
     other_grid=r.p2_dist if current==1 else r.p1_dist
     lead=other_grid[other[1]][other[0]]-own_grid[own[1]][own[0]]
     root_value=(-0.90 if lead>=0 else -0.30) if SIGMA2_STRICT_CYCLE_VALUE else (-0.45 if lead>=2 else 0.0)
     depth=node.state.depth-root.state.depth
     self._backup(node,root_value if depth%2==0 else -root_value)
     return
    seen.add(key)
    if not node.is_expanded or node.state.is_finished():break
    node=node.best_child(self.c_puct,self.fpu_reduction)
   if node.state.is_finished():value=self._terminal_value(node.state)
   else:value=self._expand(node)
   self._backup(node,value)

if MODE=='puct':
 class Sigma3ThreatAwareMCTS(Sigma2LoopAwareMCTS):
  # Bias visited opponent wall responses inside the same 200-simulation
  # budget. Do not boost our root choices or change Sigma2.
  _sigma_root_depth=0
  boosted_nodes=0
  boosted_walls=0
  focus_enabled=os.getenv('SIGMA3_FOCUS','0')=='1'
  focus_stage=0
  focus_candidates=()
  focus_count=0
  focus_alternatives=0
  def _run_simulation(self,root):
   self.focus_stage+=1
   if not self.focus_enabled or self.focus_stage<=160:
    return super()._run_simulation(root)
   if not self.focus_candidates:
    ranked=sorted((c for c in root.children if c.visit_count>=2),
                  key=lambda c:c.visit_count,reverse=True)
    if ranked:
     lead=ranked[0]
     alternatives=[c for c in ranked[1:8]
                   if c.visit_count>=max(2,lead.visit_count*.012)
                   and -c.q_value>=-lead.q_value-.15]
     self.focus_candidates=tuple([lead]+alternatives[:2])
   if len(self.focus_candidates)<2:
    return super()._run_simulation(root)
   candidates=self.focus_candidates
   if self.focus_count%4==3:
    first=candidates[1]
    self.focus_alternatives+=1
   else:
    prior_sum=sum(c.base_prior for c in root.children if c.visit_count>0)
    first=max(candidates,key=lambda c:c.puct_score(
      root.visit_count,self.c_puct,root.q_value,self.fpu_reduction,prior_sum))
   self.focus_count+=1
   node=root
   seen=set()
   while True:
    node.ensure_state()
    key=node.state._position_key()
    if key in seen or (node is not root and key in self.historical_keys):
     r=root.state
     current=r.get_current_player()
     own=r.player1pos if current==1 else r.player2pos
     other=r.player2pos if current==1 else r.player1pos
     own_grid=r.p1_dist if current==1 else r.p2_dist
     other_grid=r.p2_dist if current==1 else r.p1_dist
     lead=other_grid[other[1]][other[0]]-own_grid[own[1]][own[0]]
     root_value=(-0.90 if lead>=0 else -0.30) if SIGMA2_STRICT_CYCLE_VALUE else (-0.45 if lead>=2 else 0.0)
     depth=node.state.depth-root.state.depth
     self._backup(node,root_value if depth%2==0 else -root_value)
     return
    seen.add(key)
    if not node.is_expanded or node.state.is_finished():break
    node=first if node is root else node.best_child(self.c_puct,self.fpu_reduction)
   if node.state.is_finished():value=self._terminal_value(node.state)
   else:value=self._expand(node)
   self._backup(node,value)
  def _expand_from_eval(self,node,priors,legal_actions):
   super()._expand_from_eval(node,priors,legal_actions)
   if node.state.depth-self._sigma_root_depth!=1:return
   st=node.state
   side=st.get_current_player()
   me=st.player1pos if side==1 else st.player2pos
   opp=st.player2pos if side==1 else st.player1pos
   mg=st.p1_dist if side==1 else st.p2_dist
   og=st.p2_dist if side==1 else st.p1_dist
   old_my=mg[me[1]][me[0]]
   old_opp=og[opp[1]][opp[0]]
   ranked=sorted((child for child in node.children if isinstance(child.action,WallAction)),
                 key=lambda child:child.base_prior,reverse=True)[:4]
   boosts=0
   for child in ranked:
    child.ensure_state()
    nxt=child.state
    new_my=nxt.p1_dist[me[1]][me[0]] if side==1 else nxt.p2_dist[me[1]][me[0]]
    new_opp=nxt.p2_dist[opp[1]][opp[0]] if side==1 else nxt.p1_dist[opp[1]][opp[0]]
    if new_opp-old_opp>=2 and new_my<=old_my:
     factor=1.55 if new_opp-old_opp==2 else 1.8
     child.prior*=factor
     child.base_prior*=factor
     boosts+=1
   if boosts:
    norm=sum(c.prior for c in node.children)
    for child in node.children:
     child.prior/=norm
     child.base_prior/=norm
    self.boosted_nodes+=1
    self.boosted_walls+=boosts

def state_of(s):
 state=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:
  a=WallAction(w['x'],7-w['y'],w['o']);state._apply_wall(a)
 state._recompute_dists()
 return state
def to_action(s,a):
 if isinstance(a,WallAction):return dict(type='wall',x=a.x,y=7-a.y,o=a.orientation)
 x,y=state_of(s)._pawn_dest(a);return dict(type='move',x=x,y=8-y)
def pawn_only_forced_win(root, max_plies=10, node_limit=16000):
 # Exact tactical proof only when neither player can place walls.
 # Returns (root_action, proof_depth) for a forced winning move; returns None
 # when unproven, including node-budget exhaustion and repeating lines.
 if root.walls_p1 or root.walls_p2:return None
 nodes=[0]; memo={}; active=set()
 def solve(state, depth):
  nodes[0]+=1
  if nodes[0]>node_limit:raise OverflowError('tactical node limit')
  winner=state.winner()
  if winner:
   return (1 if winner==state.get_current_player() else -1,0)
  if depth==0:return (0,0)
  key=state._position_key()
  cache_key=(key,depth)
  if cache_key in memo:return memo[cache_key]
  if key in active:return (0,0)
  active.add(key)
  try:
   moves=[a for a in state.get_legal_actions() if isinstance(a,PawnAction)]
   # Distance-aware order: identify fast wins early without changing proof.
   def dist_after(a):
    nxt=state.next(a)
    pos=nxt.player1pos if state.get_current_player()==1 else nxt.player2pos
    grid=nxt.p1_dist if state.get_current_player()==1 else nxt.p2_dist
    return grid[pos[1]][pos[0]]
   moves.sort(key=dist_after)
   best=(-1,0);unknown=False
   for a in moves:
    result,plies=solve(state.next(a),depth-1)
    val=-result
    if val==1:
     candidate=(1,plies+1)
     if best[0]!=1 or candidate[1]<best[1]:best=candidate
    elif val==0:unknown=True
    elif best[0]==-1:best=(-1,plies+1)
   if best[0]!=1 and unknown:best=(0,0)
   memo[cache_key]=best
   return best
  finally:active.remove(key)
 try:
  winning=[]
  for a in (a for a in root.get_legal_actions() if isinstance(a,PawnAction)):
   val,plies=solve(root.next(a),max_plies-1)
   if val==-1:winning.append((plies+1,a))
  return (min(winning,key=lambda t:t[0])[1],min(winning,key=lambda t:t[0])[0]) if winning else None
 except (OverflowError,RecursionError):
  return None

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
  sims=SIGMA2_SIMS if VARIANT in ('sigma2','sigma3') else int(os.getenv('SIGMA_SIMS','20'))
  if VARIANT=='sigma3' and SIGMA3_RESEARCH_SIMS:sims=SIGMA3_RESEARCH_SIMS
  if VARIANT in ('sigma2','sigma3') and SIGMA2_REUSE:
   if PERSISTENT_AGENT is None:PERSISTENT_AGENT=(Sigma3ThreatAwareMCTS if VARIANT=='sigma3' else Sigma2LoopAwareMCTS)(evaluator=evaluator,num_simulations=sims,c_puct=SIGMA2_CPUCT,training=False)
   agent=PERSISTENT_AGENT
   # A fresh starting board belongs to a new game, not the previous tree.
   if not (history or []) and s.get('left')==[10,10] and not s.get('walls') and s['p']==[{'x':4,'y':8},{'x':4,'y':0}]:
    agent._root=None
  else:agent=(Sigma3ThreatAwareMCTS if VARIANT=='sigma3' else Sigma2LoopAwareMCTS if VARIANT=='sigma2' else MCTSAgent)(evaluator=evaluator,num_simulations=sims,c_puct=SIGMA2_CPUCT if VARIANT in ('sigma2','sigma3') else 1.2,training=False)
  if VARIANT in ('sigma2','sigma3'):
   # The root state itself is always in real-game history; only newly
   # reached descendants may be scored as repeated drawn positions.
   prior_states=[h['state'] for h in (history or []) if isinstance(h,dict) and 'state' in h]
   agent.historical_keys=frozenset(state_of(v)._position_key() for v in prior_states)
  if VARIANT=='sigma3':
   agent._sigma_root_depth=state.depth
   agent.focus_stage=0
   agent.focus_count=0
   agent.focus_candidates=()
   agent.focus_alternatives=0
   agent.boosted_nodes=0
   agent.boosted_walls=0
  root=timed_search(agent,state)
  children=sorted(root.children,key=lambda child:child.visit_count,reverse=True)
  choices=[c for c in children if json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')) in allowed]
  if choices:
   selected=choices[0].action
   if EXPLORATION>0 and not (VARIANT in ('sigma2','sigma3') and SIGMA2_DETERMINISTIC) and RNG.random()<EXPLORATION:
    pool=choices[:min(4,len(choices))]
    selected=RNG.choices([c.action for c in pool],weights=[max(1,c.visit_count) for c in pool])[0]
 remember_candidate(s,selected,root,to_action,value,len(actions))
 checkpoint()
 dbg={}
 if VARIANT=='sigma3' and MODE=='puct':dbg['sigma3ThreatPrior']={'nodes':agent.boosted_nodes,'walls':agent.boosted_walls};dbg['sigma3Focus']={'focused':agent.focus_count,'alternatives':agent.focus_alternatives,'candidates':len(agent.focus_candidates)}
 remember_candidate(s,selected,root,to_action,value,len(actions))
 if VARIANT in ('sigma2','sigma3') and MODE=='puct' and choices:
  # Choose only similarly visited candidates and discourage exact full-state loops.
  ply=int(s.get('ply',0))
  close=[c for c in choices if c.visit_count>=max(3,choices[0].visit_count*SIGMA2_CLOSE_RATIO)]
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
  tactical=pawn_only_forced_win(state) if s['left']==[0,0] else None
  # Counterfactual check for repeated pawn progress: compare adversarial
  # replies to similarly evaluated, well-visited candidate walls.
  # This is a one-reply path-race heuristic, not a forced-win proof.
  if danger and len(choices)>1 and (history or []):
   leader=choices[0]
   qualified=[c for c in choices[:8] if c.visit_count>=max(5,leader.visit_count*0.40)
              and (-c.q_value)>=(-leader.q_value)-0.10]
   def worst_race_reply(c):
    after=state.next(c.action)
    side=s['turn']
    if after.winner():return -10000 if after.winner()==side+1 else 10000
    worst=-10000
    for reply in after.get_legal_actions():
     follow=after.next(reply)
     if follow.winner()==side+1:score=-10000
     elif follow.winner()!=0:score=10000
     else:
      own=follow.player1pos if side==0 else follow.player2pos
      opp=follow.player2pos if side==0 else follow.player1pos
      own_grid=follow.p1_dist if side==0 else follow.p2_dist
      opp_grid=follow.p2_dist if side==0 else follow.p1_dist
      score=own_grid[own[1]][own[0]]-opp_grid[opp[1]][opp[0]]
     worst=max(worst,score)
    return worst
   if len(qualified)>=2:
    ranked_replies=sorted(((worst_race_reply(c),-c.visit_count,c) for c in qualified),key=lambda x:(x[0],x[1]))
    if ranked_replies[0][0]+2<=worst_race_reply(leader):
     safe_reply_choice=ranked_replies[0][2]
     dbg['counterfactual']={'alternative':to_action(s,safe_reply_choice.action),'improvement':worst_race_reply(leader)-ranked_replies[0][0]}
    else:safe_reply_choice=None
   else:safe_reply_choice=None
  else:safe_reply_choice=None
  # Exact legal immediate goal takes priority over stochastic selection or
  # cycle-prevention candidate filters. Evaluate ALL legal pawn moves.
  forced_goals=[a for a in actions if isinstance(a,PawnAction) and
    to_action(s,a)['type']=='move' and to_action(s,a)['y']==(0 if s['turn']==0 else 8)
    and json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')) in allowed]
  if tactical and json.dumps(to_action(s,tactical[0]),sort_keys=True,separators=(',',':')) in allowed:
   selected=tactical[0]
   dbg['terminalOverride']='forced-pawn-win-'+str(tactical[1])+'plies'
  elif forced_goals:
   selected=forced_goals[0]
   dbg['terminalOverride']='immediate-legal-goal'
  else:
   # Exact one-reply tactical guard near the finish: never knowingly give
   # the opponent a one-move goal if another explored move prevents it.
   # This guard does not consume extra MCTS simulations.
   other=1-s['turn']
   otherpos=state.player1pos if other==0 else state.player2pos
   if (other==0 and otherpos[1]>=7) or (other==1 and otherpos[1]<=1):
    safe=[]
    for c in choices:
     after=state.next(c.action)
     if after.winner()!=0:continue
     unsafe=any(isinstance(reply,PawnAction) and after.next(reply).winner()!=0 for reply in after.get_legal_actions() if isinstance(reply,PawnAction))
     if not unsafe:safe.append(c)
    if safe:
     choices=safe
     selected=safe[0].action
     close=[c for c in close if c in safe] or [safe[0]]
     dbg['terminalOverride']='one-reply-safety'

  if not forced_goals and not tactical and dbg.get('terminalOverride')!='one-reply-safety':
   winning=[c for c in close if to_action(s,c.action)['type']=='move' and to_action(s,c.action)['y']==(0 if s['turn']==0 else 8)]

   if winning:selected=winning[0].action
   elif danger and close:
    # Do not blindly replace a well-searched PUCT leader just to avoid a
    # recurring square. A candidate must have enough search evidence AND
    # similar estimated win value from the same root's perspective.
    leader=choices[0]
    best_q=-leader.q_value
    viable=[c for c in close if c.visit_count>=max(5,leader.visit_count*0.40) and (-c.q_value)>=best_q-0.10]
    selected=(viable[0] if viable else leader).action
    dbg['safeReplacement']={'chosen':to_action(s,selected),'bestValue':best_q,'qualified':len(viable),'keptLeader':not viable}
   elif VARIANT=='sigma3' and len(close)>1 and not danger and -choices[0].q_value-max(-c.q_value for c in close[1:])>=0.035:
    selected=choices[0].action
    dbg['sigma3ValueConfidence']={'chosen':to_action(s,selected),'gap':-choices[0].q_value-max(-c.q_value for c in close[1:])}
   elif len(close)>1 and ply<44 and not SIGMA2_DETERMINISTIC:
    temp=0.65 if ply<20 else SIGMA2_CHOICE_TEMP
    selected=RNG.choices(close,weights=[max(1,c.visit_count)**(1/temp) for c in close],k=1)[0].action
   else:selected=close[0].action
 remember_candidate(s,selected,root,to_action,value,len(actions))

 # Only consider high-impact defensive walls if MCTS actually investigated
 # them. Distance gain alone is not evidence of a good move.
 if VARIANT in ('sigma2','sigma3') and MODE=='puct' and SIGMA2_WALL_VALUE_CHECK and dbg.get('terminalOverride') is None and choices:
  leader=choices[0]
  own=s['turn']
  ownpos=state.player1pos if own==0 else state.player2pos
  opppos=state.player2pos if own==0 else state.player1pos
  mygrid=state.p1_dist if own==0 else state.p2_dist
  oppgrid=state.p2_dist if own==0 else state.p1_dist
  before_own=mygrid[ownpos[1]][ownpos[0]]
  before_opp=oppgrid[opppos[1]][opppos[0]]
  wall_options=[]
  for c in choices:
   if not isinstance(c.action,WallAction) or c.visit_count<max(4,leader.visit_count*0.08):continue
   if -c.q_value < -leader.q_value-0.08:continue
   after=state.next(c.action)
   mypos=after.player1pos if own==0 else after.player2pos
   opp=after.player2pos if own==0 else after.player1pos
   mine=after.p1_dist if own==0 else after.p2_dist
   theirs=after.p2_dist if own==0 else after.p1_dist
   own_delta=mine[mypos[1]][mypos[0]]-before_own
   opp_delta=theirs[opp[1]][opp[0]]-before_opp
   if own_delta<=0 and opp_delta>=3:wall_options.append((opp_delta-own_delta,c))
  if wall_options:
   wall_options.sort(key=lambda t:(t[0],t[1].visit_count),reverse=True)
   candidate=wall_options[0][1]
   selected_node=next((c for c in choices if c.action==selected),None)
   if selected_node is not None and candidate.visit_count>=max(8,selected_node.visit_count*0.08) and -candidate.q_value >= -selected_node.q_value-0.04:
    dbg['wallValueCheck']={'previous':to_action(s,selected),'selected':to_action(s,candidate.action),'opponentDistanceGain':wall_options[0][0],'visits':candidate.visit_count}
    selected=candidate.action
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Sigma3: rerank well-searched defensive walls.
 if VARIANT=='sigma3' and MODE=='puct' and choices and dbg.get('terminalOverride') is None:
  picked=next((c for c in choices if c.action==selected),None)
  if picked is not None and isinstance(picked.action,PawnAction):
   leader=choices[0]
   walls=[c for c in choices if isinstance(c.action,WallAction) and c.visit_count>=max(12,leader.visit_count*.25) and -c.q_value>=-picked.q_value-.015]
   if walls:
    side=s['turn']
    def distances(st):
     pp=st.player1pos if side==0 else st.player2pos
     op=st.player2pos if side==0 else st.player1pos
     pg=st.p1_dist if side==0 else st.p2_dist
     og=st.p2_dist if side==0 else st.p1_dist
     return pg[pp[1]][pp[0]],og[op[1]][op[0]]
    def threat(st):
     d,_=distances(st)
     return max((distances(st.next(a))[0]-d for a in st.get_legal_actions() if isinstance(a,WallAction)),default=0)
    before=distances(state)
    risk=threat(state.next(picked.action))
    good=[]
    for c in walls[:3]:
     nxt=state.next(c.action)
     own,opp=distances(nxt)
     # Do not trade a tempo for a wall that fails to slow the opponent when already behind.
     if own>before[0]+1 or opp<before[1] or (before[0]>before[1] and opp==before[1]):continue
     protected=threat(nxt)
     if risk-protected>=2:good.append((risk-protected,opp-before[1],-c.q_value,c,protected))
    if good:
     saving,gain,_,candidate,protected=max(good,key=lambda v:v[:3])
     dbg['sigma3Corridor']={'previous':to_action(s,selected),'selected':to_action(s,candidate.action),'riskBefore':risk,'riskAfter':protected,'riskReduction':saving,'opponentDistanceGain':gain,'visits':candidate.visit_count}
     selected=candidate.action
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Pre-commit path-regression validation. Past loop screening was based on
 # stale historic distance grids from earlier wall layouts. Evaluate each
 # prospective action against the CURRENT board, BEFORE the first retreat,
 # and only switch when a searched, value-comparable non-regressing option
 # exists. Do not forbid defensive retreats when no such option exists.
 if VARIANT in ('sigma2','sigma3') and MODE=='puct' and SIGMA2_PRECOMMIT_RETREAT and dbg.get('terminalOverride') is None and choices:
  own=s['turn']
  current_pos=state.player1pos if own==0 else state.player2pos
  current_grid=state.p1_dist if own==0 else state.p2_dist
  current_distance=current_grid[current_pos[1]][current_pos[0]]
  def next_path_cost(c):
   future=state.next(c.action)
   pos=future.player1pos if own==0 else future.player2pos
   grid=future.p1_dist if own==0 else future.p2_dist
   return grid[pos[1]][pos[0]]
  current=next((c for c in choices if c.action==selected),None)
  if current is not None and isinstance(current.action,PawnAction):
   cost=next_path_cost(current)
   if cost>current_distance:
    leader=choices[0]
    comparable=[c for c in choices[:16]
        if c.visit_count>=max(4,leader.visit_count*0.25)
        and -c.q_value>=-leader.q_value-0.12]
    better=[c for c in comparable if next_path_cost(c)<=current_distance]
    if better:
     better.sort(key=lambda c:(next_path_cost(c),-c.visit_count))
     replacement=better[0]
     if replacement.action!=selected:
      dbg['preCommitRetreat']={'rejected':to_action(s,selected),'chosen':to_action(s,replacement.action),
       'distanceBefore':current_distance,'distanceRejected':cost,
       'distanceChosen':next_path_cost(replacement)}
      selected=replacement.action
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # PREVENTIVE progress guard: before playing, screen strongly searched
 # candidate moves against plausible opponent pawn advances.  A move is
 # considered at risk only if it creates no immediate distance progress AND
 # there is no improving pawn follow-up against any of three nearest-to-goal
 # opponent replies. This is a soft preference, never a move prohibition.
 if VARIANT in ('sigma2','sigma3') and MODE=='puct' and dbg.get('terminalOverride') is None and len(choices)>1:
  side=s['turn']
  oldpos=state.player1pos if side==0 else state.player2pos
  oldgrid=state.p1_dist if side==0 else state.p2_dist
  olddistance=oldgrid[oldpos[1]][oldpos[0]]
  lead= (state.p2_dist[state.player2pos[1]][state.player2pos[0]] if side==0 else state.p1_dist[state.player1pos[1]][state.player1pos[0]])-olddistance
  leader=choices[0]
  viable=[c for c in choices[:10] if c.visit_count>=max(5,leader.visit_count*0.40) and -c.q_value>=-leader.q_value-0.10]
  def future_stall(c):
   if not isinstance(c.action,PawnAction):return False
   nxt=state.next(c.action)
   pos=nxt.player1pos if side==0 else nxt.player2pos
   grid=nxt.p1_dist if side==0 else nxt.p2_dist
   d=grid[pos[1]][pos[0]]
   # A backward step is not automatically bad: it may escape a trap.
   # The test below asks whether the opponent can force another retreat,
   # including via legal walls, BEFORE committing to this move.
   if d<olddistance:return False
   opp=1-side
   replies=nxt.get_legal_actions()
   scored=[]
   for a in replies:
    after=nxt.next(a)
    own_p=after.player1pos if side==0 else after.player2pos
    own_g=after.p1_dist if side==0 else after.p2_dist
    opp_p=after.player1pos if opp==0 else after.player2pos
    opp_g=after.p1_dist if opp==0 else after.p2_dist
    own_d=own_g[own_p[1]][own_p[0]]
    opp_d=opp_g[opp_p[1]][opp_p[0]]
    # Opponent walls threatening our route outrank quiet pawn moves.
    scored.append((own_d-opp_d,own_d,after,a))
   scored.sort(key=lambda x:(x[0],x[1]),reverse=True)
   # Always include the best walls as well as the best pawn responses.
   walls=[v for v in scored if isinstance(v[3],WallAction)][:3]
   pawn=[v for v in scored if isinstance(v[3],PawnAction)][:3]
   for _,reply_d,after,_ in walls+pawn:
    improving=False
    for follow in after.get_legal_actions():
     if not isinstance(follow,PawnAction):continue
     future=after.next(follow)
     pp=future.player1pos if side==0 else future.player2pos
     gg=future.p1_dist if side==0 else future.p2_dist
     if gg[pp[1]][pp[0]]<reply_d:
      improving=True;break
    if not improving:return True
   return False
  if SIGMA2_PREVENTIVE_WALL_OVERRIDE and lead>=-1 and len(viable)>=2:
   risk={id(c):future_stall(c) for c in viable}
   current=next((c for c in viable if c.action==selected),None)
   if current is not None and risk.get(id(current)):
    safe=[c for c in viable if not risk[id(c)]]
    if safe:
     selected=safe[0].action
     dbg['preventive']={'atRisk':to_action(s,current.action),'selected':to_action(s,selected),'reason':'no-improving-reply-after-opponent-pawn'}
 remember_candidate(s,selected,root,to_action,value,len(actions))
 if VARIANT in ('sigma2','sigma3') and MODE=='puct' and SIGMA2_ONE_REPLY_OVERRIDE and safe_reply_choice is not None and dbg.get('terminalOverride') is None:
  selected=safe_reply_choice.action
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Final action validation: post-search overrides must not reintroduce an exact
 # previously reached position, which earlier candidate filtering excluded.
 if VARIANT in ('sigma2','sigma3') and MODE=='puct' and history and dbg.get('terminalOverride') is None and choices:
  past={state_of(h['state'])._position_key() for h in history if isinstance(h,dict) and 'state' in h}
  chosen_next=state.next(selected)
  if chosen_next._position_key() in past:
   lead=choices[0]
   alternatives=[c for c in choices if state.next(c.action)._position_key() not in past]
   strong=[c for c in alternatives if c.visit_count>=max(3,lead.visit_count*0.25) and -c.q_value>=-lead.q_value-0.15]
   # Persistent cycles require an escape even when MCTS assigns all
   # non-repeating children few visits. Prefer safe distance progress.
   past_keys=[state_of(h['state'])._position_key() for h in history if isinstance(h,dict) and 'state' in h]
   cycle_count=len(past_keys)-len(set(past_keys))
   if cycle_count>=2:
    own=s['turn']
    def escape_score(a):
     nxt=state.next(a)
     pos=nxt.player1pos if own==0 else nxt.player2pos
     dist=nxt.p1_dist if own==0 else nxt.p2_dist
     op=nxt.player2pos if own==0 else nxt.player1pos
     opdist=nxt.p2_dist if own==0 else nxt.p1_dist
     opponent_goal=any(nxt.next(reply).winner()==(2 if own==0 else 1) for reply in nxt.get_legal_actions() if isinstance(reply,PawnAction))
     return (opponent_goal,dist[pos[1]][pos[0]]-opdist[op[1]][op[0]],dist[pos[1]][pos[0]],0 if isinstance(a,PawnAction) else 1)
    all_fresh=[a for a in actions if json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')) in allowed and state.next(a)._position_key() not in past]
    if all_fresh:
     selected=min(all_fresh,key=escape_score)
     dbg['cycleEscape']={'cycleCount':cycle_count,'chosen':to_action(s,selected)}
   elif strong:
    replacement=strong[0]
    dbg['finalCycleGuard']={'rejected':to_action(s,selected),'chosen':to_action(s,replacement.action)}
    selected=replacement.action
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Sigma3 bounded opponent reply verification from the EXISTING MCTS tree.
 # Inspect only visited opponent branches for the chosen move and at most two
 # comparably strong alternative root moves. No extra MCTS simulations.
 if VARIANT=='sigma3' and MODE=='puct' and choices and dbg.get('terminalOverride') is None:
  picked=next((c for c in choices if c.action==selected),None)
  leader=choices[0]
  if picked is not None and picked.visit_count>=8:
   comparable=[c for c in choices[:6] if c.action!=selected
               and c.visit_count>=max(5,leader.visit_count*.12)
               and -c.q_value >= -picked.q_value-.075][:2]
   if comparable:
    side=s['turn']
    def visited_reply_risk(candidate):
     # A smaller path differential is favorable for the active side.
     branches=sorted((n for n in candidate.children if n.visit_count>=2),
                     key=lambda n:n.visit_count,reverse=True)[:3]
     if not branches:return None
     worst=-1000
     for branch in branches:
      branch.ensure_state()
      follow=branch.state
      if follow.winner()==2-side:return 1000
      if follow.winner()==side+1:continue
      me=follow.player1pos if side==0 else follow.player2pos
      op=follow.player2pos if side==0 else follow.player1pos
      mygrid=follow.p1_dist if side==0 else follow.p2_dist
      opgrid=follow.p2_dist if side==0 else follow.p1_dist
      worst=max(worst,mygrid[me[1]][me[0]]-opgrid[op[1]][op[0]])
     return worst
    baseline=visited_reply_risk(picked)
    audited=[(visited_reply_risk(c),c) for c in comparable]
    dbg['sigma3ReplyAudit']={'candidates':len(comparable)+1,
                             'replyCap':3,'baselineRisk':baseline,
                             'alternativeRisks':[v for v,_ in audited]}
    if baseline is not None:
     better=[(risk,c) for risk,c in audited if risk is not None
             and baseline-risk>=3 and -c.q_value>=-picked.q_value-.035 and c.visit_count>=max(10,leader.visit_count*.20)]
     if better:
      risk,choice=min(better,key=lambda item:(item[0],-item[1].visit_count))
      dbg['sigma3ReplyGuard']={'previous':to_action(s,selected),
                               'selected':to_action(s,choice.action),
                               'oldRisk':baseline,'newRisk':risk,
                               'visits':choice.visit_count}
      selected=choice.action
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Sigma3 tactical safety net: never allow an immediate opponent pawn goal
 # when a legal, investigated escape exists. This is an exact one-ply test,
 # not a heuristic wall preference, and does not alter Sigma2.
 if VARIANT=='sigma3' and MODE=='puct' and choices and dbg.get('terminalOverride') is None:
  enemy=2 if s['turn']==0 else 1
  def opponent_goal_next(a):
   after=state.next(a)
   if after.winner():return after.winner()==enemy
   # A pawn cannot finish on its next turn when its static goal distance is >1.
   enemy_pos=after.player1pos if enemy==1 else after.player2pos
   enemy_grid=after.p1_dist if enemy==1 else after.p2_dist
   if enemy_grid[enemy_pos[1]][enemy_pos[0]]>1:return False
   return any(after.next(reply).winner()==enemy for reply in after.get_legal_actions() if isinstance(reply,PawnAction))
  if opponent_goal_next(selected):
   prior_keys={state_of(h['state'])._position_key() for h in (history or []) if isinstance(h,dict) and 'state' in h}
   escapes=[c for c in choices if c.action!=selected and c.visit_count>=1
            and state.next(c.action)._position_key() not in prior_keys and not opponent_goal_next(c.action)]
   if escapes:
    escape=max(escapes,key=lambda c:(c.visit_count,-c.q_value))
    dbg['sigma3ImmediateGoalDefense']={'previous':to_action(s,selected),'selected':to_action(s,escape.action),'visits':escape.visit_count}
    selected=escape.action
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Sigma3-only exact pawn-race threat witness. A confirmed threat means
 # some opponent pawn move defeats EVERY legal defensive reply.
 if VARIANT=='sigma3' and SIGMA3_TACTICAL_PROOF and MODE=='puct' and root and not state.next(selected).winner():
  enemy=2 if s['turn']==0 else 1
  enemy_pos=state.player1pos if enemy==1 else state.player2pos
  enemy_grid=state.p1_dist if enemy==1 else state.p2_dist
  if enemy_grid[enemy_pos[1]][enemy_pos[0]]<=2:
   threat=enemy_two_turn_force(state.next(selected))
   if threat:
    original=selected
    past={state_of(h['state'])._position_key() for h in (history or []) if isinstance(h,dict) and 'state' in h}
    available=[a for a in actions if json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')) in allowed and a!=selected and state.next(a)._position_key() not in past]
    visited={json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')):c.visit_count for c in root.children}
    available.sort(key=lambda a:visited.get(json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')),0),reverse=True)
    checks=0
    for alt in available:
     checks+=1
     aft=state.next(alt)
     if aft.winner()==s['turn']+1 or enemy_two_turn_force(aft) is None:
      selected=alt
      break
    dbg['sigma3TacticalProof']={'threat':threat['kind'],
      'enemyFirst':str(threat['enemyFirst']),'replies':threat['defenderReplies'],
      'checked':checks,'previous':to_action(s,original),
      'selected':to_action(s,selected),'escaped':selected!=original}
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Sigma3-only conservative offensive proof. No bonuses or unproved walls:
 # a different move is allowed only when it forces a pawn goal against every
 # legal enemy response, sooner than the existing move can prove.
 if VARIANT=='sigma3' and SIGMA3_ATTACK_PROOF and MODE=='puct' and root:
  side=state.get_current_player()
  pos=state.player1pos if side==1 else state.player2pos
  grid=state.p1_dist if side==1 else state.p2_dist
  if grid[pos[1]][pos[0]]<=4 and state.next(selected).winner()!=side:
   legal_attacks=[a for a in actions if json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')) in allowed]
   proof=find_forced_goal_two_turns(state,legal_attacks)
   rank={'immediate':0,'one':0,'two':1,'three':2}
   chosen_proof=find_forced_goal_two_turns(state,[selected])
   if not proof and (state.walls_p2 if side==1 else state.walls_p1)==0:
    proof=find_forced_three_turn_race(state,legal_attacks)
   if proof and not chosen_proof and (state.walls_p2 if side==1 else state.walls_p1)==0:
    chosen_proof=find_forced_three_turn_race(state,[selected])
   if proof and (chosen_proof is None or rank[proof['kind']]<rank[chosen_proof['kind']]):
    original=selected
    selected=proof['action']
    dbg['sigma3AttackProof']={'kind':proof['kind'],'defenderReplies':proof['defenderReplies'],
     'previous':to_action(s,original),'selected':to_action(s,selected),
     'oldProof':chosen_proof['kind'] if chosen_proof else None}
 remember_candidate(s,selected,root,to_action,value,len(actions))
 # Opt-in: compare fully enumerated ONE enemy reply at the root for
 # similarly visited MCTS candidates. This is a path-race *heuristic*,
 # never a forced-win oracle, and never modifies Sigma2.
 if VARIANT=='sigma3' and SIGMA3_MIDGAME_STRESS and MODE=='puct' and root and choices and dbg.get('terminalOverride') is None:
  if 6<=len(s['walls'])<=16:
   guard=root_stress_guard(state,selected,choices)
   if guard is not None:
    old=selected
    selected=guard['action']
    dbg['sigma3MidgameStress']={'previous':to_action(s,old),
      'selected':to_action(s,selected),'oldRisk':guard['oldRisk'],
      'newRisk':guard['newRisk'],'replies':guard['replyCount'],
      'candidates':guard['compared']}
 remember_candidate(s,selected,root,to_action,value,len(actions))
 result={'pv':[to_action(s,selected)],'elapsedMs':(time.perf_counter()-start)*1000,'value':float(value[0][0]),'legalCount':len(actions),'mode':MODE,'simulations':sims if MODE=='puct' else 0,'reusedTree':VARIANT in ('sigma2','sigma3') and SIGMA2_REUSE}
 if DIAGNOSTICS:
  visits={json.dumps(to_action(s,c.action),sort_keys=True,separators=(',',':')):c.visit_count for c in root.children} if root else {}
  result['diagnostics']={'loopDebug':dbg,'rootChildren':[{'action':to_action(s,c.action),'visits':c.visit_count,'qFromRoot':-c.q_value if c.visit_count else None,'prior':c.base_prior} for c in (sorted(root.children,key=lambda n:n.visit_count,reverse=True)[:12] if root else [])],'rootReused':bool(root and root.visit_count != sims+1),'topCandidates':[{'action':to_action(s,a),'policyLogit':score,'visits':visits.get(json.dumps(to_action(s,a),sort_keys=True,separators=(',',':')),0)} for score,a in ranked[:8]],'rootValue':float(value[0][0])}
 remember_candidate(s,selected,root,to_action,value,len(actions))
 return result
serve(choose, globals())
