import sys,json,math,hashlib
from pathlib import Path
from collections import defaultdict
import numpy as np
import onnxruntime as ort
R=Path(__file__).resolve().parent.parent
sys.path.insert(0,str(R/'vendor/sigma-quoridor'))
from game import State,WallAction
P=R/'vendor/sigma-quoridor/models/best.onnx'
m=json.loads((R/'evaluation/sigma4-value-dataset-manifest-20261105.json').read_text())
session=ort.InferenceSession(str(P),providers=['CPUExecutionProvider'])
assert session.get_inputs()[0].shape==[1,8,9,9]
rows=[]
def encode(s):
 st=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:st._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 st._recompute_dists()
 return st.to_nn_input()[None,...].astype(np.float32)
for split in ('development','holdout'):
 lines=(R/f'evaluation/sigma4-value-{split}-positions-20261105.jsonl').read_text().splitlines()
 assert len(lines)==m['splits'][split]['positions']
 for line in lines:
  obj=json.loads(line)
  v=float(session.run(['value'],{'input':encode(obj['state'])})[0][0,0])
  assert math.isfinite(v) and -1.0001<=v<=1.0001
  p=max(1e-6,min(1-1e-6,(v+1)/2))
  y=int(obj['actualValue']==1)
  rows.append({k:obj[k] for k in ('positionId','fixture','fixtureHash','ply','actualValue','ownDistance','enemyDistance')}|{'split':split,'value':v,'probability':p,'label':y,'squaredError':(p-y)**2})
def measure(a):
 if not a:return None
 n=len(a); wins=sum(x['label'] for x in a);mean=sum(x['probability'] for x in a)/n
 bins=[];ece=0
 for idx in range(5):
  subset=[x for x in a if idx/5<=x['probability']<(idx+1)/5]
  if not subset:continue
  pred=sum(x['probability'] for x in subset)/len(subset);actual=sum(x['label'] for x in subset)/len(subset)
  bins.append({'band':idx,'n':len(subset),'predicted':pred,'observed':actual})
  ece+=len(subset)/n*abs(pred-actual)
 return {'n':n,'wins':wins,'winRate':wins/n,'predictedWinRate':mean,'brier':sum(x['squaredError'] for x in a)/n,'logLoss':-sum(x['label']*math.log(x['probability'])+(1-x['label'])*math.log(1-x['probability']) for x in a)/n,'accuracy':sum((x['probability']>=.5)==bool(x['label']) for x in a)/n,'ece5':ece,'bins':bins}
dev=[x for x in rows if x['split']=='development'];hold=[x for x in rows if x['split']=='holdout']
p=sum(x['label'] for x in dev)/len(dev)
def reference(a):
 return {'pFromDevelopment':p,'brier':sum((p-x['label'])**2 for x in a)/len(a),'logLoss':-sum(x['label']*math.log(p)+(1-x['label'])*math.log(1-p) for x in a)/len(a)}
stages={}
for name,filter_fn in [('early',lambda x:x['ply']<24),('middle',lambda x:24<=x['ply']<54),('late',lambda x:x['ply']>=54),('behind3',lambda x:x['ownDistance']-x['enemyDistance']>=3)]:
 stages[name]={'development':measure([x for x in dev if filter_fn(x)]),'holdout':measure([x for x in hold if filter_fn(x)])}
groups=defaultdict(list)
for x in hold:groups[x['fixture']].append(x)
hard=sorted([x for x in dev if (x['label']==1 and x['probability']<=.25) or (x['label']==0 and x['probability']>=.75)],key=lambda x:x['squaredError'],reverse=True)[:60]
rawdev={r['positionId']:r for r in (json.loads(line) for line in (R/'evaluation/sigma4-value-development-positions-20261105.jsonl').read_text().splitlines())}
hard=[{**x,'state':rawdev[x['positionId']]['state']} for x in hard]
output={'version':'sigma4-value-calibration-v1','modelSha256':hashlib.sha256(P.read_bytes()).hexdigest(),'label':'Observed outcome, NOT guaranteed optimal state value','development':measure(dev),'holdout':measure(hold),'developmentConstant':reference(dev),'holdoutConstantFromDevelopment':reference(hold),'holdoutByOpening':{k:measure(v) for k,v in groups.items()},'byGameStage':stages,'hardDevelopmentCount':len(hard),'hardHoldoutCount':sum(x['squaredError']>=.5625 for x in hold),'approvedForTraining':False,'approvedForProduction':False,'caveats':['Only 11 independent openings; correlated moves and stochastic game outcomes','Conflicting outcome positions excluded','Observed winners are noisy policy-conditioned labels; not minimax proofs','No model weights modified']}
for file,items in [('sigma4-value-scored-20261105.jsonl',rows),('sigma4-value-hard-examples-development-20261105.jsonl',hard)]:
 (R/'evaluation'/file).write_text(''.join(json.dumps(x)+'\n' for x in items))
(R/'evaluation/sigma4-value-calibration-20261105.json').write_text(json.dumps(output,indent=2)+'\n')
print('CALIBRATION',json.dumps({k:output[k] for k in ('development','holdout','developmentConstant','holdoutConstantFromDevelopment','hardDevelopmentCount','hardHoldoutCount')}))
print('MODEL',output['modelSha256'],'SCORED',len(rows),'HOLDOUT OPENINGS',list(groups))
