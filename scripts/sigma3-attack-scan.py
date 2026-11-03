import sys,json,time
from pathlib import Path
sys.path[:0]=['scripts','vendor/sigma-quoridor']
from sigma3_attack import find_forced_goal_two_turns
from game import State,WallAction,PawnAction
def load(s):
 st=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:st._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 st._recompute_dists()
 return st
def action(st,a):
 if isinstance(a,WallAction):return {'type':'wall','x':a.x,'y':7-a.y,'o':a.orientation}
 x,y=st._pawn_dest(a)
 return {'type':'move','x':x,'y':8-y}
games=json.loads(Path('reports/sigma-selfplay/sigma2-wallvalue-trial-24.json').read_text(encoding='utf8'))['completed']
seen=set();out=[];now=time.perf_counter();tested=0
for g in games:
 for t in g['trace']:
  s=t['state']
  k=json.dumps([s['p'],s['walls'],s['left'],s['turn']],sort_keys=True)
  if k in seen:continue
  seen.add(k)
  st=load(s);p=st.player1pos if s['turn']==0 else st.player2pos;grid=st.p1_dist if s['turn']==0 else st.p2_dist;d=grid[p[1]][p[0]]
  if d>3:continue
  tested+=1
  proof=find_forced_goal_two_turns(st)
  if proof:
   old=t['action'];found=action(st,proof['action'])
   r={'game':g['index'],'ply':t['ply'],'dist':d,'kind':proof['kind'],'opponentReplies':proof['defenderReplies'],'provenAction':found,'oldAction':old,'changed':old!=found,'state':s}
   out.append(r)
   print('forced',len(out),'game',g['index'],'ply',t['ply'],'kind',proof['kind'],'changed',r['changed'],'old',old,'proven',found,flush=True)
  if len(out)>=24:break
 if len(out)>=24:break
Path('evaluation/sigma3-attack-proven-positions.json').write_text(json.dumps({'tested':tested,'positions':out},indent=2),encoding='utf8')
print('SUMMARY',{'tested':tested,'forced':len(out),'different':sum(r['changed'] for r in out),'seconds':round(time.perf_counter()-now,2)})
