"""Offline outcome head; group-wise holdout. NEVER modifies production Sigma models."""
import json
from pathlib import Path
import numpy as np
import torch
src=json.loads(Path('evaluation/sigma3-midgame-outcome-features.json').read_text())
rows=src['rows']
ids=sorted({r['id'] for r in rows})
train_ids=ids[:-2];holdout_ids=ids[-2:]
if len(ids)!=8 or len(rows)!=16 or any(len(r['results'])!=2 for r in rows):
 raise ValueError('Need complete 8-position paired dataset')
for r in rows:
 if {x['seed'] for x in r['results']}!={0,1}:raise ValueError('Seed mismatch')
 r['winRate']=sum(x['win'] for x in r['results'])/2
 r['tempo']=sum(((130-x['plies'])/130)*(1 if x['win'] else -1) for x in r['results'])/2
 r['label']=r['winRate']+0.025*r['tempo']
train=[r for r in rows if r['id'] in train_ids]
x=np.array([r['features'] for r in train],dtype=np.float32)
mu=x[:,1:].mean(axis=0);std=x[:,1:].std(axis=0)
std=np.where(std<0.05,1,std)
def transform(records):
 a=np.array([r['features'] for r in records],dtype=np.float32)
 a[:,1:]=(a[:,1:]-mu)/std
 return torch.from_numpy(a)
torch.manual_seed(20261103)
model=torch.nn.Linear(len(src['features']),1)
optimizer=torch.optim.AdamW(model.parameters(),lr=0.015,weight_decay=0.1)
tx=transform(train)
ty=torch.tensor([r['label'] for r in train],dtype=torch.float32)
for _ in range(250):
 optimizer.zero_grad()
 score=model(tx).squeeze(-1)
 loss=((score-ty)**2).mean()+0.2*model.weight[:,1:].square().sum()
 loss.backward();optimizer.step()
def score(recs):
 with torch.no_grad():return model(transform(recs)).reshape(-1).tolist()
def assess(sample_ids):
 out=[]
 for id in sample_ids:
  pair=sorted([r for r in rows if r['id']==id],key=lambda r:r['choice'])
  pred=score(pair);idx=int(pred[1]>pred[0])
  out.append({'id':id,'baselineChoice':0,'modelChoice':idx,'scores':pred,
    'baselineWinRate':pair[0]['winRate'],'modelWinRate':pair[idx]['winRate'],
    'baselineTempo':pair[0]['tempo'],'modelTempo':pair[idx]['tempo']})
 return out
train_eval=assess(train_ids);holdout=assess(holdout_ids)
report={'version':'sigma3-midgame-offline-value-v1','trainGroups':train_ids,
 'holdoutGroups':holdout_ids,'trainChoices':len(train),'holdoutChoices':4,
 'featureNames':src['features'],'labels':[{'id':r['id'],'choice':r['choice'],
 'winRate':r['winRate'],'tempo':r['tempo'],'target':r['label']}for r in rows],
 'train':train_eval,'holdout':holdout,
 'holdoutBaselineExpectedWins':sum(x['baselineWinRate'] for x in holdout),
 'holdoutModelExpectedWins':sum(x['modelWinRate'] for x in holdout),
 'promoted':False,
 'note':'Only 8 root positions and two seeds per action; training not independent proof of value or an upgrade.'}
Path('evaluation/sigma3-midgame-offline-value-review.json').write_text(json.dumps(report,indent=2))
torch.save({'state_dict':model.state_dict(),'mu':torch.from_numpy(mu),
 'std':torch.from_numpy(std),'features':src['features'],'train_ids':train_ids},
 'evaluation/sigma3-midgame-offline-value.pt')
print(json.dumps({'trainGroups':train_ids,'holdoutGroups':holdout_ids,
 'holdout':holdout,'baselineWins':report['holdoutBaselineExpectedWins'],
 'modelWins':report['holdoutModelExpectedWins'],'promoted':False},indent=2))
