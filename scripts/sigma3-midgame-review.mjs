import {readFileSync,writeFileSync} from 'node:fs';
const games=JSON.parse(readFileSync('reports/sigma-selfplay/sigma3-midgame-isolated-24.json','utf8'));
const audit=JSON.parse(readFileSync('evaluation/sigma3-midgame-stress-audit.json','utf8'));
const forced=JSON.parse(readFileSync('evaluation/sigma3-midgame-fixture33-counterfactual.json','utf8'));
const off=games.results.filter(r=>!r.enabled);
const on=games.results.filter(r=>r.enabled);
const summarize=a=>({games:a.length,sigma3Wins:a.filter(x=>x.winnerVariant==='sigma3').length,sigma2Wins:a.filter(x=>x.winnerVariant==='sigma2').length,cutoffs:a.filter(x=>x.cutoff).length,interventions:a.reduce((sum,x)=>sum+x.proofs.length,0)});
const pairs=off.map((c,i)=>({fixture:c.fixture,originalIndex:[15,20,22,26,31,33][c.fixture],side:c.sigma3Side,offWinner:c.winnerVariant,onWinner:on[i].winnerVariant,offPlies:c.plies,onPlies:on[i].plies,interventions:on[i].proofs,firstMoveChanged:JSON.stringify(c.trace[0]?.action)!==JSON.stringify(on[i].trace[0]?.action)}));
const record={version:'sigma3-midgame-opponent-response-review-v1',date:'2026-11-03',
 flag:'SIGMA3_MIDGAME_STRESS=1',enabledByDefault:false,
 change:'exhaustive one-opponent-reply path-race stress comparison of MCTS-backed root candidates, not an exact winning proof',
 conditions:{simulations:200,puct:50,exploration:0,engineRestartPerGame:true,pairedSeatSwaps:true},
 rootPositionAudit:{positions:audit.positions.length,changed:audit.positions.filter(x=>x.changed).length,changes:audit.positions.filter(x=>x.changed).map(x=>({index:x.id,old:x.off.action,trial:x.on.action,stress:x.on.stress})),meanOverheadMs:Math.round(audit.positions.reduce((s,x)=>s+x.on.ms-x.off.ms,0)/audit.positions.length)},
 isolatedTournament:{fixtures:6,totalGames:games.results.length,control:summarize(off),trial:summarize(on),changes:pairs.filter(x=>x.interventions.length),winnerChanges:pairs.filter(x=>x.offWinner!==x.onWinner),lengthChanges:pairs.filter(x=>x.offPlies!==x.onPlies)},
 forcedBranchFixture33:{forcedGames:forced.runs.length,offWins:forced.runs.filter(r=>r.name==='off'&&r.rootWon).length,onWins:forced.runs.filter(r=>r.name==='on'&&r.rootWon).length,offLengths:forced.runs.filter(r=>r.name==='off').map(r=>r.plies),onLengths:forced.runs.filter(r=>r.name==='on').map(r=>r.plies)},
 conclusion:'Do NOT promote feature: no higher win rate; changed wall action can substantially delay victory.',
 limitations:[
  'Fixture root states from earlier Sigma2 tournaments; not independently sampled gameplay distribution',
  'Only 6 paired middle-game positions in tournament; small sample',
  'Static worst-opponent path gap does not evaluate multi-turn wall value, tempo, or probability of winning',
  'Forced-branch result uses three deterministic seeds and Sigma2 self-play from one board',
  'Candidate was inspected before validation (no held-out promotion test was attempted)'
 ],
 nextDirection:'Focus on middle-game training labels from counterfactual outcomes with separate held-out fixtures, not another static path-score adjustment.'
};
writeFileSync('evaluation/sigma3-midgame-review.json',JSON.stringify(record,null,2));
console.log(JSON.stringify({control:record.isolatedTournament.control,trial:record.isolatedTournament.trial,changes:record.isolatedTournament.changes,forced:record.forcedBranchFixture33,rootAudit:record.rootPositionAudit},null,2));
