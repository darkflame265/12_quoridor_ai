"""Order-preserving bitset wall legality shared by Sigma 2/3/4."""
from game import WallAction
from sigma_search_runtime import checkpoint
from functools import lru_cache
@lru_cache(maxsize=8)
def _edge_specs(n):
 return ([(y*n+x) for y in range(n) for x in range(n-1)],
         [(y*n+x) for y in range(n-1) for x in range(n)])
def _bits_connected(start,goal,rights,ups,n):
 start_bit=1<<(start[1]*n+start[0])
 goal_mask=((1<<n)-1)<<(goal*n)
 if start_bit&goal_mask:return True
 visited=start_bit
 frontier=start_bit
 while frontier:
  next_bits=(
   ((frontier&rights)<<1) |
   ((frontier&(rights<<1))>>1) |
   ((frontier&ups)<<n) |
   ((frontier&(ups<<n))>>n)
  )&~visited
  if next_bits&goal_mask:return True
  visited|=next_bits
  frontier=next_bits
 return False
def _fast_wall_actions(self):
 if (self.walls_p1 if self.get_current_player()==1 else self.walls_p2)==0:return []
 n=self.boardsize
 # All index bits correspond to source vertices of positive X/Y edges.
 right_indices,up_indices=_edge_specs(n)
 rights=sum((1<<idx for idx in right_indices if not self.vwalls[idx]))
 ups=sum((1<<idx for idx in up_indices if not self.hwalls[idx]))
 h_illegal,v_illegal=self._build_overlap_sets()
 pe1,pe2=self.p1_path_edges,self.p2_path_edges
 p1pos,p2pos=self.player1pos,self.player2pos
 actions=[]
 for y in range(n-1):
  checkpoint()
  for x in range(n-1):
   if (x,y) not in h_illegal:
    a=('h',y,x);b=('h',y,x+1)
    check1=pe1 is None or a in pe1 or b in pe1
    check2=pe2 is None or a in pe2 or b in pe2
    if check1 or check2:
     bitmask=(3<<(y*n+x))
     new_ups=ups&~bitmask
     ok1=not check1 or _bits_connected(p1pos,n-1,rights,new_ups,n)
     ok2=not check2 or _bits_connected(p2pos,0,rights,new_ups,n)
     if ok1 and ok2:actions.append(WallAction(x,y,'h'))
    else:actions.append(WallAction(x,y,'h'))
   if (x,y) not in v_illegal:
    a=('v',y,x);b=('v',y+1,x)
    check1=pe1 is None or a in pe1 or b in pe1
    check2=pe2 is None or a in pe2 or b in pe2
    if check1 or check2:
     bitmask=(1<<(y*n+x))|(1<<((y+1)*n+x))
     new_rights=rights&~bitmask
     ok1=not check1 or _bits_connected(p1pos,n-1,new_rights,ups,n)
     ok2=not check2 or _bits_connected(p2pos,0,new_rights,ups,n)
     if ok1 and ok2:actions.append(WallAction(x,y,'v'))
    else:actions.append(WallAction(x,y,'v'))
 return actions
def install_fast_walls(state_class):
 state_class._get_legal_wall_actions=_fast_wall_actions
