"""Offline value-head evaluation on entirely untouched middle-game root positions.

Fixed architecture and hyperparameters from previous 12-root study; no search
over holdout. We never touch sigma2/sigma3 production weight files.
"""
import json
from pathlib import Path
import numpy as np
import torch
torch.manual_seed(20261103)
source=json.loads(Path('evaluation/sigma3-expanded-supervision.json').read_text(encoding='utf8'))
records=source['records'];train_ids=source['trainRootIds'];holdout_ids=source['holdoutRootIds']
assert len(train_ids)==12 and len(holdout_ids)==4
assert not set(train_ids)&set(holdout_ids)
train=[r for r in records if r['id'] in train_ids]
assert len(train)==24 and len(records)==32
x=np.array([r['features'] for r in train],dtype=np.float32)
mean=x[:,1:].mean(0)
std=np.where(x[:,1:].std(0)<.05,1,x[:,1:].std(0))
def transform(rows):
 a=np.array([r['features'] for r in rows],dtype=np.float32)
 a[:,1:]=(a[:,1:]-mean)/std
 return torch.tensor(a)
model=torch.nn.Linear(len(source['featureNames']),1)
optimizer=torch.optim.AdamW(model.parameters(),lr=.018,weight_decay=.1)
tx=transform(train)
labels=torch.tensor([r['target'] for r in train],dtype=torch.float32)
for _ in range(250):
 optimizer.zero_grad()
 loss=(model(tx).squeeze(-1)-labels).square().mean()+.2*model.weight[:,1:].square().sum()
 loss.backward();optimizer.step()
def evaluate(ids):
 out=[]
 for id in ids:
  pair=sorted((r for r in records if r['id']==id),key=lambda r:r['choice'])
  with torch.no_grad():
   scores=model(transform(pair)).reshape(-1).tolist()
  choice=int(scores[1]>scores[0])
  out.append({'id':id,'modelChoice':choice,'scores':scores,
   'baselineWinRate':pair[0]['winRate'],'modelWinRate':pair[choice]['winRate'],
   'winDelta':pair[choice]['winRate']-pair[0]['winRate'],
   'baselineTempo':pair[0]['tempo'],'modelTempo':pair[choice]['tempo'],
   'differentWinRates':pair[0]['winRate']!=pair[1]['winRate']})
 return out
training=evaluate(train_ids)
holdout=evaluate(holdout_ids)
report={'version':'sigma3-expanded-middle-game-value-v1',
 'trainRootIds':train_ids,'holdoutRootIds':holdout_ids,
 'trainLabels':len(train),'independentHoldoutLabels':8,
 'evaluation':holdout,'training':training,
 'baselineHoldoutWinSum':sum(r['baselineWinRate'] for r in holdout),
 'modelHoldoutWinSum':sum(r['modelWinRate'] for r in holdout),
 'holdoutBetter':sum(r['winDelta']>0 for r in holdout),
 'holdoutWorse':sum(r['winDelta']<0 for r in holdout),
 'promoted':False,
 'caveats':['24 labels from 12 historical middle-game positions are not enough to train a generally strong model',
            'Holdout has only four positions, with 3 stochastic continuations per candidate',
            'Root positions may share historical sources; no strength proof from short samples']}
Path('evaluation/sigma3-expanded-value-review.json').write_text(json.dumps(report,indent=2),encoding='utf8')
torch.save({'state_dict':model.state_dict(),'mean':torch.tensor(mean),
 'std':torch.tensor(std),'trainRootIds':train_ids,'features':source['featureNames']},
 'evaluation/sigma3-expanded-value-model.pt')
print(json.dumps({'quality':source['quality'],'holdout':holdout,
 'baselineWinSum':report['baselineHoldoutWinSum'],
 'modelWinSum':report['modelHoldoutWinSum'],
 'promoted':False},indent=2))
