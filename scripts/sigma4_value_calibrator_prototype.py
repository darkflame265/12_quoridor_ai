import json,math
from pathlib import Path
import numpy as np
R=Path(__file__).resolve().parent.parent
rows=[json.loads(line) for line in (R/'evaluation/sigma4-value-scored-20261105.jsonl').read_text().splitlines()]
dev=[r for r in rows if r['split']=='development']
hold=[r for r in rows if r['split']=='holdout']
assert len(dev)==308 and len(hold)==89
def design(data):
 p=np.array([r['probability'] for r in data],dtype=np.float64)
 return np.stack([np.log(p/(1-p)),np.ones_like(p)],axis=1),np.array([r['label'] for r in data],dtype=np.float64)
X,y=design(dev)
w=np.array([1.,0.]);anchor=w.copy();lam=.05
for _ in range(45):
 z=np.clip(X@w,-30,30);p=1/(1+np.exp(-z))
 grad=X.T@(p-y)/len(y)+lam*(w-anchor)
 hess=(X.T*(p*(1-p)))@X/len(y)+np.eye(2)*lam
 delta=np.linalg.solve(hess,grad)
 w-=delta
 if np.max(np.abs(delta))<1e-9:break
def metrics(data):
 X,Y=design(data)
 p=1/(1+np.exp(-np.clip(X@w,-30,30)))
 old=np.array([r['probability'] for r in data])
 return {'n':len(data),'brierOriginal':float(np.mean((old-Y)**2)),'brierCalibrated':float(np.mean((p-Y)**2)),
         'logLossOriginal':float(np.mean(-Y*np.log(old)-(1-Y)*np.log(1-old))),
         'logLossCalibrated':float(np.mean(-Y*np.log(p)-(1-Y)*np.log(1-p))),
         'accuracyOriginal':float(np.mean((old>=.5)==Y)),
         'accuracyCalibrated':float(np.mean((p>=.5)==Y))}
out={'version':'sigma4-value-platt-prototype-v1','fitSplit':'development','holdoutUsedForFit':False,
     'logitScale':float(w[0]),'logitBias':float(w[1]),'l2Anchor':[1,0],'l2Strength':lam,
     'development':metrics(dev),'holdout':metrics(hold),
     'decision':'Research-only calibration, does not replace ONNX weights. Deploy only if heldout calibration and independent match strength are proven.',
     'approvedForProduction':False}
(R/'evaluation/sigma4-value-calibrator-prototype-20261105.json').write_text(json.dumps(out,indent=2)+'\n')
print('PLATT',json.dumps(out))
