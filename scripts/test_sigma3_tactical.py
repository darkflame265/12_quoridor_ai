import sys,json,unittest
from pathlib import Path
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from game import State,WallAction,PawnAction
from sigma3_tactical import enemy_two_turn_force,choose_exact_escape,immediate_pawn_win

def load_state(s):
 st=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:st._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 st._recompute_dists()
 return st

def display(st,a):
 if isinstance(a,WallAction):return {'type':'wall','x':a.x,'y':7-a.y,'o':a.orientation}
 x,y=st._pawn_dest(a)
 return {'type':'move','x':x,'y':8-y}

class Tactics(unittest.TestCase):
 def test_actual_loss_with_exact_escape(self):
  f=json.loads(Path('evaluation/sigma3-tactical-fixtures.json').read_text(encoding='utf8'))[5]
  st=load_state(f['state']);moves=st.get_legal_actions()
  danger=next(a for a in moves if display(st,a)==f['oldAction'])
  proof=enemy_two_turn_force(st.next(danger))
  self.assertIsNotNone(proof)
  self.assertIn(proof['kind'],('one','two'))
  escape=choose_exact_escape(st,danger,moves)
  self.assertIsNotNone(escape)
  self.assertIsNone(enemy_two_turn_force(st.next(escape['action'])))
  print('REAL GAME',f['game'],f['ply'],'bad',f['oldAction'],'escape',display(st,escape['action']),'proof',proof)
 def test_unavoidable_without_wall(self):
  st=State(boardsize=9,depth=0,player1pos=(0,0),player2pos=(4,2),walls_p1=0,walls_p2=0,walls_initial=10)
  move=next(a for a in st.get_legal_actions() if isinstance(a,PawnAction))
  self.assertIsNotNone(enemy_two_turn_force(st.next(move)))
  self.assertIsNone(choose_exact_escape(st,move,st.get_legal_actions()))
 def test_defender_with_wall_not_falsely_forced(self):
  st=State(boardsize=9,depth=0,player1pos=(0,0),player2pos=(4,2),walls_p1=1,walls_p2=0,walls_initial=10)
  move=next(a for a in st.get_legal_actions() if isinstance(a,PawnAction))
  self.assertIsNone(enemy_two_turn_force(st.next(move)))
if __name__=='__main__':unittest.main(verbosity=2)
