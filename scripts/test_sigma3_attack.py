import sys,unittest
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from game import State,WallAction,PawnAction
from sigma3_attack import find_forced_goal_two_turns,find_forced_three_turn_race

class Attack(unittest.TestCase):
 def test_wall_first_forced_goal(self):
  root=State(boardsize=9,depth=0,player1pos=(4,6),player2pos=(0,1),walls_p1=1,walls_p2=0,walls_initial=10)
  self.assertIsNone(find_forced_goal_two_turns(root))
  proof=find_forced_three_turn_race(root)
  self.assertIsNotNone(proof)
  self.assertEqual(proof['kind'],'three')
  self.assertIsInstance(proof['action'],WallAction)
  self.assertEqual(proof['action'],WallAction(0,0,'h'))
  self.assertEqual(proof['defenderReplies'],2)
  self.assertIsNone(find_forced_three_turn_race(root,[PawnAction((0,1))]))
 def test_immediate_goal_beats_slower_goal(self):
  root=State(boardsize=9,depth=0,player1pos=(4,7),player2pos=(0,3),walls_p1=0,walls_p2=0,walls_initial=10)
  for f in (find_forced_goal_two_turns,find_forced_three_turn_race):
   proof=f(root)
   self.assertIsNotNone(proof)
   self.assertEqual(root.next(proof['action']).winner(),1)
 def test_no_three_turn_proof_while_enemy_has_wall(self):
  root=State(boardsize=9,depth=0,player1pos=(4,6),player2pos=(0,1),walls_p1=1,walls_p2=1,walls_initial=10)
  self.assertIsNone(find_forced_three_turn_race(root))
 def test_dangerous_race_without_own_wall(self):
  root=State(boardsize=9,depth=0,player1pos=(4,6),player2pos=(0,1),walls_p1=0,walls_p2=0,walls_initial=10)
  self.assertIsNone(find_forced_three_turn_race(root))
if __name__=='__main__':unittest.main(verbosity=2)
