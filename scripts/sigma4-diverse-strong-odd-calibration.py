from __future__ import annotations
import json,math,sys
from pathlib import Path
import numpy as np
import onnxruntime as ort
R=Path(__file__).resolve().parent.parent
E=R/'evaluation'
sys.path.insert(0,str(R/'vendor/sigma-quoridor'))
from game import State,WallAction

data=json.loads((E/'sigma4-diverse-strong-odd-conditional-20261106.json').read_text())
assert data['oddPerspectivesAudited']>=8
base=ort.InferenceSession(str(R/'vendor/sigma-quoridor/models/best.onnx'),providers=['CPUExecutionProvider'])
corr=ort.InferenceSession(str(E/'sigma4-value-residual-research-20261106.onnx'),providers=['CPUExecutionProvider'])
def encode(s):
 q=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),
         player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),
         walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:q._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 q._recompute_dists()
 return q.to_nn_input()[None,...].astype(np.float32)
out=[]
for x in data['records']:
 s=x['board']
 v=float(base.run(['value'],{'input':encode(s)})[0][0,0])
 p=np.clip((v+1)/2,1e-6,1-1e-6)
 z=float(math.log(p/(1-p)))
 turn=s['turn'];w=s['left']
 features=np.asarray([[np.clip(z,-6,6)/4,np.clip(x['pathGap']/10,-2,2),
   (w[turn]-w[1-turn])/10,min(2,x['ply']/100),
   len(s['walls'])/20,(w[turn]+w[1-turn])/20]],dtype=np.float32)
 cv=float(corr.run(['corrected_value'],{
  'features':features,'original_logit':np.asarray([z],dtype=np.float32)})[0][0,0])
 q=(cv+1)/2
 observations=[int(t['oddMoverWon']) for t in x['forcedConditionalObservations']]
 assert len(observations)==4
 avg=lambda val:float(sum((val-y)**2 for y in observations)/len(observations))
 out.append({'id':x['id'],'parentId':x['parentId'],'split':x['split'],
  'ply':x['ply'],'wallCount':x['wallCount'],'pathGap':x['pathGap'],
  'originalP':float(p),'correctedP':float(q),
  'observedConditionalMoverWinFraction':sum(observations)/4,
  'originalConditionalBrier':avg(float(p)),
  'correctedConditionalBrier':avg(float(q))})
def summary(rs):
 if not rs:return None
 avg=lambda k:sum(v[k] for v in rs)/len(rs)
 return {'correlatedOddSnapshots':len(rs),'originalBrier':avg('originalConditionalBrier'),
  'correctedBrier':avg('correctedConditionalBrier'),
  'conditionalWinFraction':avg('observedConditionalMoverWinFraction'),
  'correctedBetterSnapshots':sum(v['correctedConditionalBrier']<v['originalConditionalBrier'] for v in rs)}
result={'version':'sigma4-diverse-strong-odd-conditional-calibration-v1',
 'all':summary(out),'development':summary([v for v in out if v['split']=='development']),
 'holdout':summary([v for v in out if v['split']=='holdout']),
 'snapshots':out,
 'sourceGroupIndependence':'NONE beyond existing even source games; each odd board is exactly one source move before an even board',
 'observedOutcomeCondition':'Last source move from odd board to even board FORCED, then observed even-source game continuation. NOT new independent engine policy from odd board.',
 'noTrainingPerformed':True,'promotionApproved':False}
(E/'sigma4-diverse-strong-odd-calibration-20261106.json').write_text(json.dumps(result,indent=2)+'\n')
print('ODD CONDITIONAL BRIER',json.dumps({k:result[k] for k in ('all','development','holdout')},indent=2))
