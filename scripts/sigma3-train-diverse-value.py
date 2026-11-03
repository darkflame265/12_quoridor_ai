"""Offline Sigma3 value regression; never modifies production engines."""
import json
from pathlib import Path
import numpy as np
import torch
SRC=Path('evaluation/sigma3-midgame-diverse-features.json')
OUT=Path('evaluation/sigma3-midgame-diverse-model-review.json')
MODEL=Path('evaluation/sigma3-midgame-diverse-model.pt')
torch.manual_seed(20261103)
a=json.loads(SRC.read_text(encoding='utf8'))
rows=a['records'];train_ids=a['trainRootIds'];test_ids=a['holdoutRootIds']
train=[r for r in rows if r['id'] in train_ids]
if len(train)!=len(train_ids)*2 or len(rows)!=24:raise ValueError('incomplete groups')
x=np.array([r['features'] for r in train],dtype=np.float32)
mean=x[:,1:].mean(0);std=np.where(x[:,1:].std(0)<.05,1,x[:,1:].std(0))
def transform(recs):
 z=np.array([r['features'] for r in recs],dtype=np.float32)
 z[:,1:]=(z[:,1:]-mean)/std
 return torch.tensor(z)
net=torch.nn.Linear(len(a['featureNames']),1)
optim=torch.optim.AdamW(net.parameters(),lr=.018,weight_decay=.1)
tx=transform(train);labels=torch.tensor([r['target'] for r in train])
for _ in range(250):
 optim.zero_grad()
 loss=(net(tx).squeeze(-1)-labels).square().mean()+.2*net.weight[:,1:].square().sum()
 loss.backward();optim.step()
def evaluate(ids):
 out=[]
 for id in ids:
  pair=sorted([r for r in rows if r['id']==id],key=lambda r:r['choice'])
  with torch.no_grad():score=net(transform(pair)).reshape(-1).tolist()
  choice=int(score[1]>score[0])
  out.append({'id':id,'modelChoice':choice,'scores':score,
   'baselineWinRate':pair[0]['winRate'],'modelWinRate':pair[choice]['winRate'],
   'winDelta':pair[choice]['winRate']-pair[0]['winRate'],
   'baselineTempo':pair[0]['tempo'],'modelTempo':pair[choice]['tempo'],
   'candidateWinRateDifferent':pair[0]['winRate']!=pair[1]['winRate']})
 return out
training=evaluate(train_ids);holdout=evaluate(test_ids)
report={'version':'sigma3-midgame-stochastic-value-v1',
 'method':'regularized Torch linear value head; grouped holdout',
 'trainRootIds':train_ids,'holdoutRootIds':test_ids,
 'quality':a['quality'],'training':training,'holdout':holdout,
 'baselineHoldoutWinSum':sum(r['baselineWinRate'] for r in holdout),
 'modelHoldoutWinSum':sum(r['modelWinRate'] for r in holdout),
 'holdoutBetter':sum(r['winDelta']>0 for r in holdout),
 'holdoutWorse':sum(r['winDelta']<0 for r in holdout),
 'promoted':False,
 'caveat':'Two varied continuations per root action; no robust win-rate improvement confirmed; no production weights changed.'}
OUT.write_text(json.dumps(report,indent=2),encoding='utf8')
torch.save({'state_dict':net.state_dict(),'mean':torch.tensor(mean),
 'std':torch.tensor(std),'featureNames':a['featureNames'],'trainIds':train_ids},MODEL)
print(json.dumps({'quality':a['quality'],'holdout':holdout,
 'baselineWinSum':report['baselineHoldoutWinSum'],
 'modelWinSum':report['modelHoldoutWinSum'],'promoted':False},indent=2))
