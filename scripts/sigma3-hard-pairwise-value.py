"""Experimental Sigma3 pairwise value ranker with conservative MCTS gating."""
import json
from pathlib import Path
import numpy as np
F=Path('evaluation')
first=json.loads((F/'sigma3-expanded-supervision.json').read_text(encoding='utf8'))['records']
nextset=json.loads((F/'sigma3-unseen-middle-features.json').read_text(encoding='utf8'))['records']
rows=first+nextset
pairs=[]
for id in sorted({r['id'] for r in rows}):
 p=sorted([r for r in rows if r['id']==id],key=lambda r:r['choice'])
 if len(p)!=2:raise ValueError('missing '+str(id))
 a,b=p
 x=np.array(b['features'][1:],dtype=float)-np.array(a['features'][1:],dtype=float)
 pairs.append(dict(id=id,x=x,winDelta=b['winRate']-a['winRate'],
                   qGap=a['features'][1]-b['features'][1],
                   visitGap=a['features'][2]-b['features'][2],
                   baseline=a['winRate'],alternative=b['winRate']))
def fit(training):
 x=np.array([r['x'] for r in training],dtype=float)
 y=np.array([r['winDelta'] for r in training])
 weight=np.array([1 if abs(z)>0.01 else .45 for z in y])
 return np.linalg.solve((x.T*weight)@x+4*np.eye(x.shape[1]),(x.T*weight)@y)
def evaluate(p,w):
 predicted=float(p['x']@w)
 choose=int(predicted>=.10 and p['qGap']<.30 and p['visitGap']<.32)
 return {'id':p['id'],'chooseAlternative':bool(choose),
         'estimatedWinDelta':round(predicted,4),
         'observedWinDelta':p['winDelta'],
         'chosenWinRate':p['alternative'] if choose else p['baseline'],
         'baselineWinRate':p['baseline'],
         'resultDelta':(p['alternative']-p['baseline'])*choose,
         'mctsQGap':round(p['qGap'],3)}
groups={'original12':[p for p in pairs if p['id']<25 or p['id'] in [26,28,32,33]],
        'prior_holdout4':[p for p in pairs if p['id'] in [25,27,29,34]],
        'unseen_100_103':[p for p in pairs if 100<=p['id']<=103],
        'unseen_104_107':[p for p in pairs if 104<=p['id']<=107]}
assert sum(len(x) for x in groups.values())==24
cv=[]
for group,test in groups.items():
 train=[p for name,rr in groups.items() if name!=group for p in rr]
 w=fit(train)
 result=[evaluate(p,w) for p in test]
 cv.append({'group':group,'trainRoots':len(train),'testRoots':len(test),
    'baselineSum':sum(x['baselineWinRate'] for x in result),
    'rankerSum':sum(x['chosenWinRate'] for x in result),
    'changed':sum(x['chooseAlternative'] for x in result),
    'results':result})
all_w=fit(pairs)
overall=[evaluate(p,all_w) for p in pairs]
report={'version':'sigma3-hard-pairwise-value-experiment-v1',
        'trainingRootCount':len(pairs),'outcomeDifferentCount':sum(p['winDelta']!=0 for p in pairs),
        'method':'Fixed ridge pairwise regression, 4-group cross validation, switch only with predicted benefit >=.10, Q gap <.30, log-visit gap <.32',
        'featureNames':['MctsQ','logVisits','ownDistGain','enemyDistGain','ownWalls','enemyWalls','isWall','plyFraction'],
        'crossValidation':cv,
        'cvBaselineSum':sum(z['baselineSum'] for z in cv),
        'cvRankerSum':sum(z['rankerSum'] for z in cv),
        'cvChanges':sum(z['changed'] for z in cv),
        'allFitResults':overall,
        'productionPromotion':False,
        'limitations':['Correlated roots from historical game files','Very small outcome-discriminating sample','Offline ranking is not tournament evidence']}
(F/'sigma3-hard-pairwise-value-experiment.json').write_text(json.dumps(report,indent=2),encoding='utf8')
(F/'sigma3-hard-pairwise-value-weights.json').write_text(json.dumps(
 {'version':'sigma3-hard-pairwise-v1','weights':all_w.tolist(),
  'features':report['featureNames'],'qMax':.30,'visitGapMax':.32,'minimumPredictedGain':.10,
  'trainingRoots':[p['id'] for p in pairs],'deployed':False},indent=2),encoding='utf8')
print(json.dumps({'roots':len(pairs),'discriminating':report['outcomeDifferentCount'],
                   'cvBaseline':report['cvBaselineSum'],'cvRanker':report['cvRankerSum'],
                   'changed':report['cvChanges'],
                   'byGroup':[{k:g[k] for k in ('group','baselineSum','rankerSum','changed')} for g in cv]},indent=2))
