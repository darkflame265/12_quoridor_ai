import sys,time
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from sigma3_tactical import enemy_two_turn_force,immediate_pawn_win
from game import State,WallAction,PawnAction
for left in [0,1]:
 root=State(boardsize=9,depth=0,player1pos=(0,0),player2pos=(4,2),walls_p1=left,walls_p2=0,walls_initial=10)
 actions=root.get_legal_actions()
 start=time.perf_counter()
 for action in [a for a in actions if isinstance(a,PawnAction)][:1]:
  after=root.next(action)
  risk=enemy_two_turn_force(after)
  print('left',left,'action',str(action),'risk',risk,'ms',round((time.perf_counter()-start)*1000))
  if risk:
   rescue=[]
   for a in actions:
    after=root.next(a)
    if enemy_two_turn_force(after) is None:
     rescue.append(str(a))
     if len(rescue)>3:break
   print('rescues',rescue)
