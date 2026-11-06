from pathlib import Path
import json
import math
import sys
import hashlib
import time

import numpy as np
import onnxruntime as ort

ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evaluation'
sys.path.insert(0,str(ROOT/'vendor/sigma-quoridor'))
from game import State,WallAction

def load(p):return json.loads((E/p).read_text(encoding='utf-8'))
def lines(p):return [json.loads(x) for x in (E/p).read_text(encoding='utf-8').splitlines() if x.strip()]
base=ort.InferenceSession(str(ROOT/'vendor/sigma-quoridor/models/best.onnx'),providers=['CPUExecutionProvider'])
correction=ort.InferenceSession(str(E/'sigma4-value-residual-research-20261106.onnx'),providers=['CPUExecutionProvider'])
training=load('sigma4-value-residual-research-20261106.json')
scored={r['positionId']:r for r in lines('sigma4-value-scored-20261105.jsonl')}
old=lines('sigma4-value-holdout-positions-20261105.jsonl')
cross=load('sigma4-crosspolicy-audit-20261106.json')
bank={r['id']:r for r in lines('sigma4-unseen-wall-positions-20261105.jsonl')}
new=[r for r in cross['positionSummaries'] if r['split']=='holdout']
assert len(old)==89 and len(new)==4

def encode(s):
    q=State(boardsize=9,depth=s['turn'],
        player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),
        player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),
        walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
    for w in s['walls']:q._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
    q._recompute_dists()
    return q.to_nn_input()[None,...].astype(np.float32)
def feats(s,original_value,path_gap,ply):
    p=max(1e-6,min(1-1e-6,(original_value+1)/2))
    z=math.log(p/(1-p))
    cur=s['turn'];wall=s['left']
    f=[max(-6,min(6,z))/4,max(-2,min(2,path_gap/10)),
       (wall[cur]-wall[1-cur])/10,min(2,ply/100),
       len(s['walls'])/20,(wall[cur]+wall[1-cur])/20]
    return np.array([f],dtype=np.float32),np.array([z],dtype=np.float32)
results={'oldHoldout':[],'newHoldout':[]}
durations=[]
for label,items in [('oldHoldout',old),('newHoldout',new)]:
 for row in items:
    state=row['state'] if label=='oldHoldout' else bank[row['id']]['state']
    expected=scored[row['positionId']]['value'] if label=='oldHoldout' else None
    value=float(base.run(['value'],{'input':encode(state)})[0][0,0])
    if expected is not None:assert abs(value-expected)<2e-5,(row['positionId'],value,expected)
    f,z=feats(state,value,(row['ownDistance']-row['enemyDistance'] if label=='oldHoldout' else row['pathGap']),row['ply'])
    start=time.perf_counter()
    fixed=float(correction.run(['corrected_value'],{'features':f,'original_logit':z})[0][0,0])
    durations.append((time.perf_counter()-start)*1000)
    p=(value+1)/2
    q=(fixed+1)/2
    target=(float(row['actualValue']==1) if label=='oldHoldout' else row['observedWinFraction'])
    # Expected Brier for mixture of policy outcomes, not just squared error on mean.
    irreducible=0 if label=='oldHoldout' else target*(1-target)
    results[label].append({'positionId':row['positionId'],'baseP':p,'correctedP':q,'observedWin':target,
        'baseBrier':(p-target)**2+irreducible,'correctedBrier':(q-target)**2+irreducible})
def stats(items):
    return {'n':len(items),'originalBrier':sum(r['baseBrier'] for r in items)/len(items),
      'correctedBrier':sum(r['correctedBrier'] for r in items)/len(items)}
duration=sorted(durations)
report={'version':'sigma4-residual-onnx-realboards-v1',
 'tests':{label:stats(items) for label,items in results.items()},
 'correctionCallMedianMs':duration[len(duration)//2],
 'correctionCallP95Ms':duration[math.ceil(.95*len(duration))-1],
 'correctionCallMaxMs':max(duration),
 'testPositions':len(old)+len(new),
 'baseModelSha256':hashlib.sha256((ROOT/'vendor/sigma-quoridor/models/best.onnx').read_bytes()).hexdigest(),
 'correctionOnnxSha256':hashlib.sha256((E/'sigma4-value-residual-research-20261106.onnx').read_bytes()).hexdigest(),
 'valuesMatchTrainingEvaluation':True,
 'caveats':['Correction timings exclude base network inference, geometry encoding, search overhead and worker startup',
  'New holdout has only four independent boards; this does not verify gameplay strength',
  'Corrected ONNX is a separate add-on and is not production deployed'],
 'productionApproved':False}
for label,oldReport in [('oldHoldout',training['oldHoldout']),('newHoldout',training['newHoldout'])]:
    current=report['tests'][label]
    assert abs(current['originalBrier']-oldReport['originalBrier'])<3e-5,(label,'base',current,oldReport)
    assert abs(current['correctedBrier']-oldReport['prototypeBrier'])<3e-5,(label,'new',current,oldReport)
(E/'sigma4-value-residual-onnx-realboards-20261106.json').write_text(json.dumps(report,indent=2)+'\n',encoding='utf-8')
print('PASS REAL-BOARD ONNX CORRECTION',json.dumps(report,indent=2))
