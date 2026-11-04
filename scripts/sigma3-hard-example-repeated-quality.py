"""Sigma3 hard example label reliability: 5 paired stochastic continuations per action."""
import json
from pathlib import Path
import numpy as np
from collections import defaultdict
F=Path('evaluation')
old=json.loads((F/'sigma3-unseen-middle-outcomes.json').read_text(encoding='utf8'))['results']
new=json.loads((F/'sigma3-hard-example-repeated-rollouts.json').read_text(encoding='utf8'))['results']
aud=json.loads((F/'sigma3-unseen-middle-audited.json').read_text(encoding='utf8'))
roots={f['id']:f for f in aud}
ids=[101,103,105]
rng=np.random.default_rng(20261104)
out=[]
for id in ids:
 by={}
 for choice in [0,1]:
  records=[r for r in old if r['id']==id and r['choice']==choice]+[r for r in new if r['id']==id and r['choice']==choice]
  if len(records)!=5 or {r['seed'] for r in records}!={0,1,2,3,4}:
   raise ValueError('missing seed group '+str(id)+' '+str(choice))
  if any(r['cutoff'] for r in records):raise ValueError('incomplete')
  wins=sum(r['win'] for r in records)
  by[choice]={'choice':choice,'games':len(records),'wins':wins,'observedWinRate':wins/len(records),
              'seedOutcomes':{str(r['seed']):bool(r['win']) for r in records},
              'distinctSequences':len({r['sequenceHash'] for r in records})}
 a,b=by[0],by[1]
 posterior_a=rng.beta(a['wins']+1,a['games']-a['wins']+1,200000)
 posterior_b=rng.beta(b['wins']+1,b['games']-b['wins']+1,200000)
 diff=posterior_b-posterior_a
 delta=b['observedWinRate']-a['observedWinRate']
 out.append({'id':id,'mctsQGap':roots[id]['rootCandidates'][0]['qFromRoot']-roots[id]['rootCandidates'][1]['qFromRoot'],
             'mctsVisitCounts':[roots[id]['rootCandidates'][i]['visits'] for i in [0,1]],
             'baseline':a,'alternative':b,
             'observedDelta':delta,
             'bayesianPosteriorProbAlternativeBetter':float((diff>0).mean()),
             'posteriorDelta95PercentInterval':[float(np.quantile(diff,.025)),float(np.quantile(diff,.975))],
             'highConfidenceAlternative':bool((diff>0).mean()>=.975 and a['games']>=10 and b['games']>=10),
             'interpretation':'Posterior uses independent uniform-beta priors and treats varied continuations as Bernoulli; game samples and positions may be correlated.'})
report={'version':'sigma3-hard-example-repeated-quality-v1','rootIds':ids,
        'additionalContinuationGames':len(new),'totalPairedContinuations':sum(r['id'] in ids for r in old)+len(new),
        'rootEvaluation':out,'anyAlternativePromotion':any(x['highConfidenceAlternative'] for x in out),
        'productionUnchanged':True,
        'caveats':['Five games per action are weak estimates and not opponent-model robust.',
                   'Posthoc targeted roots are no longer untouched validation positions.']}
(F/'sigma3-hard-example-repeated-quality.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'additional':len(new),'rootEvaluation':[{
 'id':x['id'],'baselineWins':x['baseline']['wins'],'alternativeWins':x['alternative']['wins'],
 'delta':x['observedDelta'],'posteriorBetter':x['bayesianPosteriorProbAlternativeBetter'],
 'credibleInterval':x['posteriorDelta95PercentInterval'],
 'promote':x['highConfidenceAlternative']} for x in out]},indent=2))
