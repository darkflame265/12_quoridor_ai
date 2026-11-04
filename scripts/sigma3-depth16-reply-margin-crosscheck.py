from pathlib import Path
import json
F=Path('evaluation')
def read(name):return json.loads((F/name).read_text('utf8'))
audit=read('sigma3-unseen-middle-audited.json')
independent=read('sigma3-independent-middle-fixtures.json')
historic=read('sigma3-diverse-match-fixtures.json')
roots={x['id']:x for x in audit}
roots.update({x['id']:x for x in independent})
roots[28]={**historic[28],'id':28}
outcomes={}
for id in [101,103,105]:
 a=read('sigma3-unseen-middle-outcomes.json')['results']
 b=read('sigma3-hard-example-repeated-rollouts.json')['results']
 outcomes[id]=[r for r in a+b if r['id']==id]
for id in [27,29]:
 a=read('sigma3-midgame-independent-holdout-outcomes.json')['results']
 b=read('sigma3-midgame-holdout-confirmation-outcomes.json')['results']
 outcomes[id]=[r for r in a+b if r['id']==id]
a=read('sigma3-midgame-diverse-outcomes.json')['results']
outcomes[28]=[r for r in a if r['id']==28]
result=[]
for id in [101,103,105,27,29,28]:
 r=read('sigma3-fixture'+str(id)+'-reply-depth16.json') if id in [101,103,105] else read('sigma3-validation'+str(id)+'-reply-depth16.json')
 side=roots[id]['s']['turn'];other=1-side
 b=[]
 for branch in r['branches']:
  snapshots={str(n):t['distancesAfter'] for n in [2,4,8,12,16] for t in branch['replies'] if t['plyAfterForced']==n}
  progress={n:{'ownDist':d[side],'opponentDist':d[other],'margin':d[other]-d[side]} for n,d in snapshots.items()}
  matches=[x for x in outcomes[id] if x['choice']==branch['choice']]
  wins=sum(x.get('win',x.get('rootWon')) is True for x in matches)
  b.append({'choice':branch['choice'],'forcedAction':branch['forcedAction'],
   'replyMilestones':progress,'observedWins':wins,
   'observedGames':len(matches),'observedWinRate':wins/len(matches),
   'remainingWalls':branch['stateAfter16Plies']['left'],
   'after16Margin':progress['16']['margin']})
 preferred=int(b[1]['after16Margin']>b[0]['after16Margin'])
 observed=int(b[1]['observedWinRate']>b[0]['observedWinRate'])
 tie=b[0]['observedWinRate']==b[1]['observedWinRate']
 result.append({'id':id,'rootSide':side,'branches':b,
   'deterministic16PreferredChoice':preferred,
   'observedPreferredChoice':None if tie else observed,
   'predictsObservedBetterChoice':None if tie else preferred==observed})
print(json.dumps([{'id':x['id'],
 'rootSide':x['rootSide'],
 'initial4':[z['replyMilestones']['4']['margin'] for z in x['branches']],
 'after16':[z['after16Margin'] for z in x['branches']],
 'observedWins':[z['observedWins'] for z in x['branches']],
 'observedGames':[z['observedGames'] for z in x['branches']],
 'predicted':x['deterministic16PreferredChoice'],
 'observedBetter':x['observedPreferredChoice'],
 'match':x['predictsObservedBetterChoice']} for x in result],indent=2))
report={'version':'sigma3-depth16-reply-margin-crosscheck-v1',
 'method':'Force top-two actions then 16 Sigma2 deterministic PUCT-200 reply plies. Compare own-vs-opponent BFS distance advantage at each milestone, not game win.',
 'cases':result,
 'discriminating':sum(x['observedPreferredChoice'] is not None for x in result),
 'correctDirection':sum(x['predictsObservedBetterChoice'] is True for x in result),
 'incorrectDirection':sum(x['predictsObservedBetterChoice'] is False for x in result),
 'promoted':False,
 'limitations':['16-ply deterministic continuation is single policy path, not minimax or a proof of a winner',
  'Observed wins are 2 or 5 varied followups per candidate and correlated by source games',
  'Cases 101,103,105 are diagnostic examples previously examined; not independent holdout',
  '16 additional PUCT searches per candidate cause prohibitive interactive latency']}
(F/'sigma3-depth16-reply-margin-crosscheck.json').write_text(json.dumps(report,indent=2),'utf8')
