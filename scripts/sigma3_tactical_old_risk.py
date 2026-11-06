import sys,json
from pathlib import Path
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from sigma3_tactical import enemy_two_turn_force
from game import State,WallAction,PawnAction
fixtures=json.loads(Path('evaluation/sigma3-tactical-fixtures.json').read_text(encoding='utf8'))
for i,f in enumerate(fixtures):
 s=f['state'];state=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:state._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 state._recompute_dists()
 def to_action(a):
  if isinstance(a,WallAction):return {'type':'wall','x':a.x,'y':7-a.y,'o':a.orientation}
  x,y=state._pawn_dest(a);return {'type':'move','x':x,'y':8-y}
 old=next((a for a in state.get_legal_actions() if to_action(a)==f['oldAction']),None)
 r=enemy_two_turn_force(state.next(old)) if old else None
 print(i,'game',f['game'],'ply',f['ply'],'oldRisk',bool(r),'old',f['oldAction'],'danger',f['dangerCount'],'safe',f['safeCount'])
