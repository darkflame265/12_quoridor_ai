import sys,json,time
from pathlib import Path
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from sigma3_tactical import enemy_two_turn_force
from game import State,WallAction,PawnAction
def parse(s):
 state=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:
  state._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 state._recompute_dists()
 return state
records=json.loads(Path('reports/sigma-selfplay/sigma2-wallvalue-trial-24.json').read_text(encoding='utf8'))['completed']
seen=set();results=[];begin=time.perf_counter()
for g in records:
 for t in g['trace']:
  s=t['state'];key=json.dumps([s['p'],s['walls'],s['left'],s['turn']],sort_keys=True)
  if key in seen:continue
  seen.add(key)
  st=parse(s)
  enemy=2 if s['turn']==0 else 1
  pos=st.player1pos if enemy==1 else st.player2pos
  grid=st.p1_dist if enemy==1 else st.p2_dist
  d=grid[pos[1]][pos[0]]
  if d>2:continue
  dangerous=[];safe=[]
  for a in st.get_legal_actions():
   r=enemy_two_turn_force(st.next(a))
   (dangerous if r else safe).append(a)
  if dangerous and safe:
   item={'game':g['index'],'ply':t['ply'],'enemyDist':d,'turn':s['turn'],'dangerCount':len(dangerous),'safeCount':len(safe),'state':s,'risk':str(dangerous[:3]),'escape':str(safe[:3]),'oldAction':t['action']}
   results.append(item);print('found',len(results),'ply',t['ply'],'enemyDist',d,'danger',len(dangerous),'safe',len(safe),'old',t['action'],flush=True)
  if len(results)>=8:break
 if len(results)>=8:break
Path('evaluation/sigma3-tactical-fixtures.json').write_text(json.dumps(results,indent=2),encoding='utf8')
print('SUMMARY',len(results),'secs',round(time.perf_counter()-begin,2))
