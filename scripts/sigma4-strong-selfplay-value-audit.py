from __future__ import annotations
import json,math,hashlib,sys
from pathlib import Path
import numpy as np
import onnxruntime as ort

ROOT=Path(__file__).resolve().parent.parent
E=ROOT/'evaluation'
sys.path.insert(0,str(ROOT/'vendor/sigma-quoridor'))
from game import State,WallAction

raw=json.loads((E/'sigma4-strong-selfplay-midgames-20261106.json').read_text(encoding='utf-8'))
match=json.loads((E/'sigma4-strong-selfplay-onnx-tournament-20261106.json').read_text(encoding='utf-8'))
assert len(match['games'])==60
from typing import Any
base=ort.InferenceSession(str(ROOT/'vendor/sigma-quoridor/models/best.onnx'),providers=['CPUExecutionProvider'])
res=ort.InferenceSession(str(E/'sigma4-value-residual-research-20261106.onnx'),providers=['CPUExecutionProvider'])

def board_to_nn(s):
 q=State(boardsize=9,depth=s['turn'],player1pos=(s['p'][0]['x'],8-s['p'][0]['y']),
 player2pos=(s['p'][1]['x'],8-s['p'][1]['y']),
 walls_p1=s['left'][0],walls_p2=s['left'][1],walls_initial=10)
 for w in s['walls']:q._apply_wall(WallAction(w['x'],7-w['y'],w['o']))
 q._recompute_dists()
 return q.to_nn_input()[None,...].astype(np.float32)
def eval_position(src):
 s=src['board']
 original=float(base.run(['value'],{'input':board_to_nn(s)})[0][0,0])
 p=float(np.clip((original+1)/2,1e-6,1-1e-6))
 logit=float(math.log(p/(1-p)))
 side=s['turn']
 features=np.array([[np.clip(logit,-6,6)/4,
  np.clip((src['ownDistance']-src['enemyDistance'])/10,-2,2),
  (s['left'][side]-s['left'][1-side])/10,
  min(2,src['ply']/100),
  len(s['walls'])/20,
  (s['left'][side]+s['left'][1-side])/20]],dtype=np.float32)
 corr=float(res.run(['corrected_value'],{
  'features':features,'original_logit':np.array([logit],dtype=np.float32)})[0][0,0])
 return ((original+1)/2,(corr+1)/2)
results=[]
for src in raw['openings'][:10]:
 orig,corr=eval_position(src)
 games=[g for g in match['games'] if g['id']==src['id']]
 assert len(games)==6
 assert all(g['winner'] in (0,1) for g in games)
 targets=[float(g['winner']==src['board']['turn']) for g in games]
 mix=sum(targets)/len(targets)
 err_o=sum((orig-y)**2 for y in targets)/len(targets)
 err_c=sum((corr-y)**2 for y in targets)/len(targets)
 results.append({'id':src['id'],'split':src['split'],'ply':src['ply'],
 'wallCount':src['wallCount'],'pathGap':src['ownDistance']-src['enemyDistance'],
 'observedMoverWins':sum(targets),'continuations':len(games),
 'originalNNP':orig,'correctedNNP':corr,'originalBrier':err_o,'correctedBrier':err_c,
 'observedMoverWinFraction':mix})
def summary(rows):
 if not rows:return None
 return {'independentStartingBoards':len(rows),
 'continuations':sum(r['continuations'] for r in rows),
 'networkBrier':sum(r['originalBrier'] for r in rows)/len(rows),
 'correctedBrier':sum(r['correctedBrier'] for r in rows)/len(rows),
 'positionsWhereCorrectedErrorLower':sum(r['correctedBrier']<r['originalBrier'] for r in rows),
 'meanObservedWinFraction':sum(r['observedMoverWinFraction'] for r in rows)/len(rows)}
out={'version':'sigma4-strong-selfplay-value-calibration-v1',
 'evaluationSource':'Actual strong-Sigma4/Sigma3 self-play midgame, same exact source board per six policy continuations',
 'overall':summary(results),'development':summary([r for r in results if r['split']=='development']),
 'holdout':summary([r for r in results if r['split']=='holdout']),
 'positions':results,
 'baseModelSha256':hashlib.sha256((ROOT/'vendor/sigma-quoridor/models/best.onnx').read_bytes()).hexdigest(),
 'correctedModelSha256':hashlib.sha256((E/'sigma4-value-residual-research-20261106.onnx').read_bytes()).hexdigest(),
 'unseenSinceTraining':True,'trainingOrModelSelectionPerformedHere':False,
 'caveats':['Six observed continuations per source board share policies, histories and searches; independent sample size is the number of source boards',
 'Observed wins are conditional on the tested opponent and engine versions, not solved Quoridor values',
 'Some source boards are already strongly winning or losing','All base/corrected values use exactly the same source state'],
 'productionApproved':False}
(E/'sigma4-strong-selfplay-value-calibration-20261106.json').write_text(json.dumps(out,indent=2)+'\n',encoding='utf-8')
print('STRONG VALUE CALIBRATION',json.dumps({k:out[k] for k in ('overall','development','holdout')},indent=2))
