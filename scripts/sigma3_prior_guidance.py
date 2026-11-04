from game import WallAction
import math
def guide_root_priors(node, max_children=12, strength=0.20):
 state=node.state
 side=state.get_current_player()
 own=state.player1pos if side==1 else state.player2pos
 foe=state.player2pos if side==1 else state.player1pos
 own_grid=state.p1_dist if side==1 else state.p2_dist
 foe_grid=state.p2_dist if side==1 else state.p1_dist
 own_before=own_grid[own[1]][own[0]]
 foe_before=foe_grid[foe[1]][foe[0]]
 candidates=sorted(node.children,key=lambda x:x.base_prior,reverse=True)[:max_children]
 guided=0
 for child in candidates:
  child.ensure_state()
  nxt=child.state
  own_pos=nxt.player1pos if side==1 else nxt.player2pos
  foe_pos=nxt.player2pos if side==1 else nxt.player1pos
  own_after=(nxt.p1_dist if side==1 else nxt.p2_dist)[own_pos[1]][own_pos[0]]
  foe_after=(nxt.p2_dist if side==1 else nxt.p1_dist)[foe_pos[1]][foe_pos[0]]
  own_advance=own_before-own_after
  foe_delay=foe_after-foe_before
  wall=isinstance(child.action,WallAction)
  score=own_advance+foe_delay-(.65 if wall else 0)
  if wall and own_advance<0:score-=.8
  factor=math.exp(strength*max(-2.,min(2.,score)))
  child.base_prior*=factor
  child.prior*=factor
  guided+=1
 if guided:
  total=sum(c.base_prior for c in node.children)
  for child in node.children:
   child.base_prior/=total
   child.prior/=total
 return guided
