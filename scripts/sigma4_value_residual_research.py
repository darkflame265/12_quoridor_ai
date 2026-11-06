from __future__ import annotations
import json
import math
import random
from collections import Counter,defaultdict
from pathlib import Path

import numpy as np
import torch
from torch import nn

ROOT=Path(__file__).resolve().parent.parent
EVAL=ROOT/'evaluation'
torch.set_num_threads(1)
torch.manual_seed(20261106)
np.random.seed(20261106)
random.seed(20261106)

def read_json(path):
    return json.loads(path.read_text(encoding='utf-8'))
def read_jsonl(path):
    return [json.loads(s) for s in path.read_text(encoding='utf-8').splitlines() if s.strip()]
old_dev=read_jsonl(EVAL/'sigma4-value-development-positions-20261105.jsonl')
old_hold=read_jsonl(EVAL/'sigma4-value-holdout-positions-20261105.jsonl')
old_scored={r['positionId']:r for r in read_jsonl(EVAL/'sigma4-value-scored-20261105.jsonl')}
cross=read_json(EVAL/'sigma4-crosspolicy-audit-20261106.json')
new_dev=read_jsonl(EVAL/'sigma4-crosspolicy-development-unanimous-20261106.jsonl')
new_hold=[r for r in cross['positionSummaries'] if r['split']=='holdout']
old_meta=read_json(EVAL/'sigma4-value-dataset-manifest-20261105.json')
old_hold_groups={r['hash'] for r in old_meta['fixtureGroups'] if r['split']=='holdout'}
old_dev_groups={r['hash'] for r in old_meta['fixtureGroups'] if r['split']=='development'}
assert len(old_dev)==308 and len(old_hold)==89
assert len(new_hold)==4 and len(old_hold_groups)==3 and len(old_dev_groups)==8
assert cross['candidateCount']==len(new_dev)
assert all(x['policyUnanimity'] for x in new_dev)

def clip(x,lo,hi):return max(lo,min(hi,x))
def vector(row,base_p,own_diff,ply,state):
    # Network original log-odds plus game-geometry side inputs; no holdout labels.
    pp=clip(float(base_p),1e-6,1-1e-6)
    logit=math.log(pp/(1-pp))
    turn=state['turn']
    remaining=state['left']
    return [clip(logit,-6,6)/4,
            clip(own_diff/10,-2,2),
            (remaining[turn]-remaining[1-turn])/10,
            clip(ply/100,0,2),
            len(state['walls'])/20,
            (remaining[turn]+remaining[1-turn])/20],logit

def make_old(rows,split):
    out=[]
    for r in rows:
        p=old_scored[r['positionId']]['probability']
        features,z=vector(r,p,r['ownDistance']-r['enemyDistance'],r['ply'],r['state'])
        assert ((r['actualValue']+1)//2) in (0,1)
        out.append({'id':r['positionId'],'group':'old-'+r['fixtureHash'],
            'partition':split,'origin':'old','x':features,'z':z,
            'p':p,'target':float(r['actualValue']==1),'states':1})
    return out
def make_new(rows,split):
    out=[]
    for r in rows:
        features,z=vector(r,r['originalNetworkProbability'],r['pathGap'],r['ply'],r['state'] if 'state' in r else bank[r['id']]['state'])
        assert 0<=r['observedWinFraction']<=1
        out.append({'id':r['positionId'],'group':'new-'+r['id'],
            'partition':split,'origin':'new','x':features,'z':z,
            'p':r['originalNetworkProbability'],'target':r['observedWinFraction'],
            'states':4})
    return out
bank={r['id']:r for r in read_jsonl(EVAL/'sigma4-unseen-wall-positions-20261105.jsonl')}
old_train=make_old(old_dev,'development')
old_test=make_old(old_hold,'holdout')
new_train=make_new(new_dev,'development')
new_test=make_new(new_hold,'holdout')
all_train=old_train+new_train
all_test=old_test+new_test
assert not ({r['id'] for r in all_train}&{r['id'] for r in all_test}),'position leakage'
assert not ({r['group'] for r in all_train}&{r['group'] for r in all_test}),'group leakage'
assert len({r['group'] for r in new_train})==len(new_train)
assert len({r['group'] for r in new_test})==len(new_test)

# Reserve selected development groups only for internal stopping.
old_groups=sorted({r['group'] for r in old_train})
new_groups=sorted({r['group'] for r in new_train})
internal_valid=set(old_groups[-2:])|set(new_groups[-max(1,len(new_groups)//4):])
inner_fit=[r for r in all_train if r['group'] not in internal_valid]
inner_val=[r for r in all_train if r['group'] in internal_valid]
assert len(inner_fit)>100 and len(inner_val)>10

class ResidualValue(nn.Module):
    def __init__(self):
        super().__init__()
        self.network=nn.Sequential(nn.Linear(6,12),nn.Tanh(),nn.Linear(12,1))
        nn.init.zeros_(self.network[-1].weight)
        nn.init.zeros_(self.network[-1].bias)
    def forward(self,x,network_logit):
        correction=self.network(x).squeeze(-1)
        return network_logit+correction
def tensors(rows,weighted=False):
    X=torch.tensor([r['x'] for r in rows],dtype=torch.float32)
    Z=torch.tensor([r['z'] for r in rows],dtype=torch.float32)
    Y=torch.tensor([r['target'] for r in rows],dtype=torch.float32)
    if weighted:
        ct=Counter(r['group'] for r in rows)
        weight=torch.tensor([1/ct[r['group']] for r in rows],dtype=torch.float32)
        weight/=weight.sum()
    else:weight=torch.ones(len(rows),dtype=torch.float32)/len(rows)
    return X,Z,Y,weight
def calc_loss(model,rows,weight=True):
    X,Z,Y,W=tensors(rows,weighted=weight)
    logits=model(X,Z)
    individual=nn.functional.binary_cross_entropy_with_logits(logits,Y,reduction='none')
    correction=logits-Z
    return (W*individual).sum()+.035*(W*correction.square()).sum()
def predict(model,rows):
    X,Z,_,_=tensors(rows)
    with torch.no_grad():return torch.sigmoid(model(X,Z)).cpu().numpy().astype(float).tolist()
def brier(rows,probs,macro=False):
    errors=[((p-r['target'])**2+r['target']*(1-r['target']) if r['origin']=='new' else (p-r['target'])**2) for r,p in zip(rows,probs)]
    if not macro:return sum(errors)/len(errors)
    group=defaultdict(list)
    for r,e in zip(rows,errors):group[r['group']].append(e)
    return sum(sum(v)/len(v) for v in group.values())/len(group)
def fit(rows,epochs,seed=20261106):
    torch.manual_seed(seed)
    model=ResidualValue()
    optimizer=torch.optim.AdamW(model.parameters(),lr=.015,weight_decay=.005)
    history=[]
    for ep in range(epochs):
        optimizer.zero_grad()
        loss=calc_loss(model,rows)
        loss.backward()
        optimizer.step()
        history.append(float(loss.detach()))
    return model,history
record=[]
best={'epoch':0,'brier':brier(inner_val,[r['p'] for r in inner_val],True)}
torch.manual_seed(20261106)
model=ResidualValue()
optimizer=torch.optim.AdamW(model.parameters(),lr=.015,weight_decay=.005)
for ep in range(1,61):
    optimizer.zero_grad()
    loss=calc_loss(model,inner_fit)
    loss.backward()
    optimizer.step()
    score=brier(inner_val,predict(model,inner_val),True)
    record.append({'epoch':ep,'internalValidationGroupBrier':score,'trainingLoss':float(loss.detach())})
    if score+1e-7<best['brier']:best={'epoch':ep,'brier':score}
# If internal groups don't benefit, keep the identity residual rather than forcing a model update.
if best['epoch']==0:
    final=ResidualValue()
    selected=0
else:
    selected=best['epoch']
    final,_=fit(all_train,selected)
def diagnostics(rows):
    if not rows:return None
    preds=predict(final,rows)
    return {'nPositions':len(rows),'groups':len({r['group'] for r in rows}),
     'originalBrier':brier(rows,[r['p'] for r in rows]),
     'prototypeBrier':brier(rows,preds),
     'originalGroupMacroBrier':brier(rows,[r['p'] for r in rows],True),
     'prototypeGroupMacroBrier':brier(rows,preds,True),
     'originalMeanP':sum(r['p'] for r in rows)/len(rows),
     'prototypeMeanP':sum(preds)/len(preds),
     'observedMean':sum(r['target'] for r in rows)/len(rows)}
result={'version':'sigma4-research-residual-value-v1',
 'description':'Research-only 6-input residual neural probability head, NOT a drop-in replacement for the 8x9x9 ONNX value evaluator',
 'randomSeed':20261106,'featureNames':['originalValueLogitDiv4','ownMinusOpponentPathDiv10',
  'ownMinusOpponentWallsDiv10','plyDiv100','placedWallsDiv20','remainingWallsDiv20'],
 'oldDevelopmentCount':len(old_train),'newUnanimousDevelopmentCount':len(new_train),
 'newAmbiguousDevelopmentExcluded':cross['rejectedAmbiguousCount'],
 'oldHoldoutCount':len(old_test),'newHoldoutCount':len(new_test),
 'holdoutNeverUsedToSelectEpoch':True,'internalValidationGroups':sorted(internal_valid),
 'bestInternalDevelopmentEpoch':selected,'bestInternalDevelopmentBrier':best['brier'],
 'innerValidationOriginalBrier':brier(inner_val,[r['p'] for r in inner_val],True),
 'development':diagnostics(all_train),'oldHoldout':diagnostics(old_test),'newHoldout':diagnostics(new_test),
 'combinedHoldout':diagnostics(all_test),
 'notes':['Soft observed labels only for scoring; only unanimous new DEVELOPMENT labels used to fit',
 'Development and holdout are disjoint by position and opening group',
 'No existing ONNX model modified and no production worker changed',
 'Outcomes are conditional on policies and trajectories, not solved minimax truth'],
 'researchOnly':True,'productionPromotionApproved':False,
 'epochTrace':record}
resultPath=EVAL/'sigma4-value-residual-research-20261106.json'
resultPath.write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
checkpoint=EVAL/'sigma4-value-residual-research-20261106.pt'
torch.save({'model':final.state_dict(),'features':result['featureNames'],
  'selectedEpoch':selected,'seed':20261106,'dataCounts':{'oldDev':len(old_train),'newDev':len(new_train)},
  'note':'Research only, no ONNX best.onnx modification'},checkpoint)
print('RESIDUAL RESEARCH',json.dumps({k:result[k] for k in ('bestInternalDevelopmentEpoch',
 'innerValidationOriginalBrier','bestInternalDevelopmentBrier','development','oldHoldout','newHoldout','combinedHoldout')},indent=2))
print('CHECKPOINT',checkpoint,checkpoint.stat().st_size)
