import sys,json,time
from pathlib import Path
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from sigma3_attack import find_forced_three_turn_race,find_forced_goal_two_turns
from game import State,WallAction,PawnAction
def load(s):
 st=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:st._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 st._recompute_dists()
 return st
def to_action(st,a):
 if isinstance(a,WallAction):return {'type':'wall','x':a.x,'y':7-a.y,'o':a.orientation}
 x,y=st._pawn_dest(a);return {'type':'move','x':x,'y':8-y}
games=json.loads(Path('reports/sigma-selfplay/sigma2-wallvalue-trial-24.json').read_text(encoding='utf8'))['completed']
seen=set();tested=0;found=[];start=time.perf_counter()
for g in games:
 for t in g['trace']:
  s=t['state'];opp=1-s['turn']
  if s['left'][opp]:continue
  key=json.dumps([s['p'],s['walls'],s['left'],s['turn']],sort_keys=True)
  if key in seen:continue
  seen.add(key)
  st=load(s);me=st.player1pos if s['turn']==0 else st.player2pos;dist=st.p1_dist if s['turn']==0 else st.p2_dist
  if dist[me[1]][me[0]]>4:continue
  tested+=1
  proof=find_forced_three_turn_race(st)
  if proof:
   old=t['action'];first=to_action(st,proof['action'])
   rec={'game':g['index'],'ply':t['ply'],'kind':proof['kind'],'type':first['type'],'changed':old!=first,'old':old,'attack':first,'state':s,'replies':proof['defenderReplies']}
   found.append(rec)
   print('FOUND',g['index'],t['ply'],'old',old,'attack',first,'changed',rec['changed'],'ms',round((time.perf_counter()-start)*1000),flush=True)
  else:print('none',g['index'],t['ply'],flush=True)
Path('evaluation/sigma3-attack-three-turn-scan.json').write_text(json.dumps({'tested':tested,'cases':found,'seconds':round(time.perf_counter()-start,2)},indent=2),encoding='utf8')
print('SUMMARY',tested,len(found),sum(x['changed'] for x in found),sum(x['type']=='wall' for x in found),round(time.perf_counter()-start,2))
