"""Evaluate the frozen, previously trained 12-position value head on eight new roots.

No training or parameter tuning on the eight roots is permitted here.
"""
import json
from pathlib import Path
import torch
import numpy as np
data=json.loads(Path('evaluation/sigma3-unseen-middle-features.json').read_text('utf8'))
existing=torch.load('evaluation/sigma3-expanded-value-model.pt',map_location='cpu',weights_only=True)
train_ids=existing['trainRootIds']
assert set(train_ids).isdisjoint(data['rootIds'])
assert existing['features']==data['featureNames']
model=torch.nn.Linear(len(data['featureNames']),1)
model.load_state_dict(existing['state_dict']);model.eval()
mean=existing['mean'].numpy();std=existing['std'].numpy()
rows=data['records']
results=[]
for root in data['rootIds']:
 pair=sorted([r for r in rows if r['id']==root],key=lambda r:r['choice'])
 assert len(pair)==2
 inputs=np.array([p['features'] for p in pair],dtype=np.float32)
 inputs[:,1:]=(inputs[:,1:]-mean)/std
 with torch.no_grad():scores=model(torch.tensor(inputs)).flatten().tolist()
 selected=int(scores[1]>scores[0])
 results.append({'id':root,'selectedCandidate':selected,
                 'baselineCandidate':0,'values':scores,
                 'baselineWinRate':pair[0]['winRate'],
                 'modelWinRate':pair[selected]['winRate'],
                 'winDelta':pair[selected]['winRate']-pair[0]['winRate'],
                 'candidateWinRates':[p['winRate'] for p in pair]})
report={'version':'sigma3-frozen-value-external-holdout-v1',
 'trainedOnRootIds':train_ids,'heldOutRootIds':data['rootIds'],
 'trainingFrozen':True,'evaluatedPositions':len(results),
 'baselineWinSum':sum(x['baselineWinRate'] for x in results),
 'modelWinSum':sum(x['modelWinRate'] for x in results),
 'improvedPositions':sum(x['winDelta']>0 for x in results),
 'regressedPositions':sum(x['winDelta']<0 for x in results),
 'results':results,'promoted':False,
 'limitations':['Only two randomized continuations per root action',
                'Different board states may be correlated by shared game origins',
                'Randomized Sigma2 follow-up is not equivalent to Sigma3-vs-Sigma2 tournament']}
Path('evaluation/sigma3-frozen-value-external-holdout.json').write_text(json.dumps(report,indent=2),'utf8')
print(json.dumps(report,indent=2))
