from pathlib import Path
import ast, random, sys, json, time
ROOT=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(ROOT/'vendor/sigma-quoridor'))
from game import State, WallAction, PawnAction
reference=State._get_legal_wall_actions
source=(ROOT/'scripts/sigma4-bitset-wall-worker.py').read_text(encoding='utf-8')
fragment=source[source.index('from functools import lru_cache'):source.index("MODEL=ROOT/")]
scope={'State':State,'WallAction':WallAction}
exec(fragment,scope)
def sig(a):
 return ('wall',a.x,a.y,a.orientation) if isinstance(a,WallAction) else ('pawn',tuple(a.direction))
rng=random.Random(20261105)
checked=0
old_ms=0.0
new_ms=0.0
walls=0
maxwall=0
start=time.perf_counter()
for gi in range(26):
 s=State(boardsize=9,walls_p1=10,walls_p2=10)
 for ply in range(70):
  t0=time.perf_counter()
  old=[sig(a) for a in reference(s)]
  old_ms+=(time.perf_counter()-t0)*1000
  t0=time.perf_counter()
  new=[sig(a) for a in s._get_legal_wall_actions()]
  new_ms+=(time.perf_counter()-t0)*1000
  if old!=new:
   raise AssertionError(json.dumps({'game':gi,'ply':ply,'depth':s.depth,'wallAnchors':list(s.hwall_anchors)+list(s.vwall_anchors),'expected':old,'actual':new},default=str))
  checked+=1
  wallnum=len(s.hwall_anchors)+len(s.vwall_anchors)
  maxwall=max(maxwall,wallnum)
  if wallnum>=10:walls+=1
  if s.is_finished():break
  legal=s.get_legal_actions()
  if not legal:break
  wall_acts=[a for a in legal if isinstance(a,WallAction)]
  pawn_acts=[a for a in legal if isinstance(a,PawnAction)]
  if wall_acts and (not pawn_acts or rng.random()<0.68):
   action=rng.choice(wall_acts)
  else:
   action=rng.choice(pawn_acts)
  s=s.next(action)
report={'boardSize':9,'states':checked,'statesWith10PlusWalls':walls,'maxWalls':maxwall,'originalWallMs':round(old_ms,2),'bitsetWallMs':round(new_ms,2),'ms':round((time.perf_counter()-start)*1000,1),'allMatched':True}
(ROOT/'evaluation/sigma4-bitset-wall-legality-9x9-20261105.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PASS direct legal walls',json.dumps(report))
