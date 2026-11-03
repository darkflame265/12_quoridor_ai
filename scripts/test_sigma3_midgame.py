import sys,json,unittest
from pathlib import Path
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from game import State,WallAction,PawnAction
from sigma3_midgame import worst_enemy_reply,root_stress_guard

def make_state(s):
 st=State(boardsize=9,depth=s['turn'],
  player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),
  player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),
  walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:
  st._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 st._recompute_dists()
 return st

def external(st,action):
 if isinstance(action,WallAction):return {'type':'wall','x':action.x,'y':7-action.y,'o':action.orientation}
 x,y=st._pawn_dest(action)
 return {'type':'move','x':x,'y':8-y}

class Child:
 def __init__(self,action,visits,q):
  self.action=action
  self.visit_count=visits
  self.q_value=q

class StressTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  a=json.loads(Path('evaluation/sigma3-diverse-match-fixtures.json').read_text(encoding='utf8'))[33]['s']
  cls.state=make_state(a)
  cls.moves=cls.state.get_legal_actions()
  cls.original=next(x for x in cls.moves if external(cls.state,x)=={'type':'move','x':1,'y':4})
  cls.wall=next(x for x in cls.moves if external(cls.state,x)=={'type':'wall','x':2,'y':4,'o':'h'})
 def test_midgame_stress_finds_path_gain(self):
  old=worst_enemy_reply(self.state,self.original)
  new=worst_enemy_reply(self.state,self.wall)
  self.assertEqual(old[0]-new[0],2)
  self.assertGreater(new[1],0)
  print('MIDGAME CASE 33',old,new)
 def test_comparable_candidate_guard(self):
  children=[Child(self.original,60,-.25),Child(self.wall,30,-.25)]
  out=root_stress_guard(self.state,self.original,children)
  self.assertIsNotNone(out)
  self.assertEqual(out['action'],self.wall)
  self.assertEqual(out['oldRisk']-out['newRisk'],2)
 def test_worse_mcts_alternative_rejected(self):
  children=[Child(self.original,60,-.25),Child(self.wall,30,.25)]
  self.assertIsNone(root_stress_guard(self.state,self.original,children))
 def test_unvisited_candidate_rejected(self):
  children=[Child(self.original,60,-.25),Child(self.wall,1,-.25)]
  self.assertIsNone(root_stress_guard(self.state,self.original,children))
if __name__=='__main__':
 unittest.main(verbosity=2)
