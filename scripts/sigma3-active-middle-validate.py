"""Prospective evaluation of fixed midgame rankers on fresh active roots.

No training, tuning, or promotion based on evaluated roots.
"""
import json
from pathlib import Path
import numpy as np
import torch
F=Path('evaluation')
data=json.loads((F/'sigma3-active-middle-features.json').read_text('utf8'))
pairs=[]
for id in data['rootIds']:
 c=sorted([r for r in data['records'] if r['id']==id],key=lambda r:r['choice'])
 if len(c)!=2:raise ValueError('incomplete '+str(id))
 pairs.append(c)
learned=json.loads((F/'sigma3-hard-pairwise-value-weights-v2.json').read_text('utf8'))
old=torch.load(F/'sigma3-expanded-value-model.pt',map_location='cpu',weights_only=True)
assert data['featureNames']==old['features']
assert [x.lower() for x in learned['features']]==[x.lower() for x in ['mctsQ','logVisits','ownDistGain','enemyDistGain','ownWalls','enemyWalls','isWall','plyFraction']]
assert set(data['rootIds']).isdisjoint(old['trainRootIds'])
assert set(data['rootIds']).isdisjoint(learned['trainingRoots'])
net=torch.nn.Linear(len(data['featureNames']),1)
net.load_state_dict(old['state_dict']);net.eval()
w=np.asarray(learned['weights'],dtype=float)
mu=old['mean'].numpy();std=old['std'].numpy()
records=[]
for base,alt in pairs:
 x=np.asarray([base['features'],alt['features']],dtype=np.float32)
 transformed=x.copy()
 transformed[:,1:]=(transformed[:,1:]-mu)/std
 with torch.no_grad():old_scores=net(torch.tensor(transformed)).flatten().tolist()
 old_choice=int(old_scores[1]>old_scores[0])
 difference=(x[1,1:]-x[0,1:]).astype(float)
 estimate=float(difference@w)
 qgap=float(x[0,1]-x[1,1])
 visitgap=float(x[0,2]-x[1,2])
 v2choice=int(estimate>=learned['minimumPredictedGain'] and
  qgap<learned['qMax'] and visitgap<learned['visitGapMax'])
 values=[base['winRate'],alt['winRate']]
 records.append({'id':base['id'],'candidateWinRates':values,'mctsChoice':0,
  'priorValueHeadChoice':old_choice,'pairwiseV2Choice':v2choice,
  'priorValueScores':old_scores,'pairwisePredictedDelta':estimate,
  'mctsQGap':qgap,'visitLogGap':visitgap,
  'baselineWinRate':values[0],
  'priorValueWinRate':values[old_choice],
  'pairwiseV2WinRate':values[v2choice]})
report={'version':'sigma3-active-middle-prospective-validation-v1',
 'rootIds':data['rootIds'],'runCount':data['outcomes'],
 'uniqueSequences':data['uniqueSequences'],'trainingFrozen':True,
 'records':records,'baselineWinSum':sum(r['baselineWinRate'] for r in records),
 'priorValueWinSum':sum(r['priorValueWinRate'] for r in records),
 'pairwiseV2WinSum':sum(r['pairwiseV2WinRate'] for r in records),
 'priorValueChanges':sum(r['priorValueHeadChoice']!=0 for r in records),
 'pairwiseV2Changes':sum(r['pairwiseV2Choice']!=0 for r in records),
 'promoted':False,
 'caveats':['Outcome estimates use two randomized continuations per root candidate',
  'Not evidence of sigma3-vs-sigma2 strength','MCTS and model outcomes estimated from source-game positions']}
(F/'sigma3-active-middle-prospective-validation.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'baseline':report['baselineWinSum'],'oldHead':report['priorValueWinSum'],
 'pairwiseV2':report['pairwiseV2WinSum'],'changes':report['pairwiseV2Changes'],
 'records':records},indent=2))
