"""Outcome contradiction audit of Sigma3 midgame MCTS decisions.

Only realized randomized follow-ups are available: these are noisy labels, not
counterfactual proofs. This report diagnoses association, not causal bugs.
"""
import json
from pathlib import Path
F=Path('evaluation')
b=json.loads((F/'sigma3-expanded-supervision.json').read_text('utf8'))['records']
c=json.loads((F/'sigma3-unseen-middle-features.json').read_text('utf8'))['records']
rows=b+c
issues=[]
for id in sorted({r['id'] for r in rows}):
    v=sorted((r for r in rows if r['id']==id),key=lambda x:x['choice'])
    if len(v)!=2:raise ValueError('incomplete root '+str(id))
    a,z=v
    mcts_q_gap=a['features'][1]-z['features'][1]
    visit_gap=a['features'][2]-z['features'][2]
    observed=z['winRate']-a['winRate']
    issues.append(dict(id=id,rootSource='new' if id>=100 else 'prior',
        mctsChosen=a['action'],alternative=z['action'],
        mctsQGap=round(mcts_q_gap,3),logVisitGap=round(visit_gap,3),
        ownDistanceGain=[a['features'][3],z['features'][3]],
        enemyDistanceIncrease=[a['features'][4],z['features'][4]],
        rootWallCounts=[a['features'][5],a['features'][6]],
        observedBaselineWinRate=a['winRate'],
        observedAlternativeWinRate=z['winRate'],
        winRateDelta=round(observed,3),differingWinner=observed!=0,
        labelConfidence='LOW: 2-5 continuations per candidate'))
hard=[x for x in issues if x['differingWinner']]
contradictory=[x for x in hard if x['winRateDelta']>0]
report={'version':'sigma3-outcome-hard-example-audit-v1',
 'totalPositions':len(issues),'contradictoryCandidateOutcomes':len(contradictory),
 'discriminatingPositions':len(hard),'discriminatingIds':[x['id'] for x in hard],
 'caseStudies':[x for x in issues if x['id'] in (101,103,105)],
 'otherContradictions':contradictory,
 'allPositions':issues,
 'interpretation':'MCTS Q and visits can disagree with noisy outcomes, especially for path-changing walls. No evidence identifies a definite bug; avoid universal wall penalty or unconditional learned override.'}
(F/'sigma3-outcome-hard-example-audit.json').write_text(json.dumps(report,indent=2),encoding='utf8')
print(json.dumps({'positions':len(issues),'discriminating':len(hard),'contradictions':len(contradictory),'caseStudies':report['caseStudies']},indent=2))
