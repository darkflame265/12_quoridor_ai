import sys
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from game import State,WallAction
from sigma3_attack import find_forced_goal_two_turns,find_forced_three_turn_race
for opp in [1,2,3]:
 st=State(boardsize=9,depth=0,player1pos=(4,6),player2pos=(0,opp),walls_p1=1,walls_p2=0,walls_initial=10)
 a=find_forced_goal_two_turns(st)
 b=find_forced_three_turn_race(st)
 print('opp',opp,'two',a,'three',b,'walls',st.walls_p1,flush=True)
