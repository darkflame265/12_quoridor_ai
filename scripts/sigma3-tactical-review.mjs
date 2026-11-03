import {readFileSync,writeFileSync} from 'node:fs';
const report=JSON.parse(readFileSync('reports/sigma-selfplay/sigma3-tactical-isolated-48.json','utf8'));
const old=JSON.parse(readFileSync('reports/sigma-selfplay/sigma3-tactical-control-24.json','utf8'));
const earlier=JSON.parse(readFileSync('reports/sigma-selfplay/sigma3-tactical-probe-24.json','utf8'));
const group=enabled=>report.results.filter(x=>x.enabled===enabled);
const control=group(false),active=group(true);
const diffs=control.map((c,i)=>{
 const a=active[i],firstDifferent=c.trace.findIndex((t,j)=>JSON.stringify(t.action)!==JSON.stringify(a.trace[j]?.action));
 return {fixture:c.fixture,sigma3Side:c.sigma3Side,controlWinner:c.winnerVariant,activeWinner:a.winnerVariant,controlPlies:c.plies,activePlies:a.plies,proofs:a.proofs.length,escapes:a.proofs.filter(p=>p.escaped),firstDifferent};
});
const audit={
 version:'sigma3-pawn-force-isolated-20261103',
 theory:'Exact opponent pawn-first win in one or two enemy turns; all defender replies enumerated on each candidate witness; does not prove move is best',
 productionEnabled:false,
 exploration:0,
 simulations:200,
 processRestartPerGame:true,
 fixtures:12,
 eachCohortGames:24,
 totalGames:48,
 control:{sigma3Wins:control.filter(x=>x.winnerVariant==='sigma3').length,sigma2Wins:control.filter(x=>x.winnerVariant==='sigma2').length,cutoffs:control.filter(x=>x.cutoff).length},
 experimental:{sigma3Wins:active.filter(x=>x.winnerVariant==='sigma3').length,sigma2Wins:active.filter(x=>x.winnerVariant==='sigma2').length,cutoffs:active.filter(x=>x.cutoff).length,threatWitnesses:active.reduce((s,x)=>s+x.proofs.length,0),actualEscapes:active.flatMap(x=>x.proofs).filter(x=>x.escaped).length},
 changesInWinner:diffs.filter(x=>x.controlWinner!==x.activeWinner),
 changesInLength:diffs.filter(x=>x.controlPlies!==x.activePlies),
 actionableInterventions:diffs.filter(x=>x.escapes.length>0),
 note:'Earlier non-isolated tournament 11-13 vs 10-14 was confounded by reused engine processes and random streams across games and must not be treated as independent algorithm effect.',
 limitations:[
  'Fixtures are late-game states extracted from prior Sigma2 matches; observations are correlated.',
  'Exact proof covers pawn-first opponent wins within two enemy turns, not all possible wall-first tactical traps.',
  'Avoiding an exact short-horizon loss is not the same as guaranteeing better long-term winning chance.',
  '24 games per cohort are insufficient for small win-rate differences.'
 ],
 future:'Expand independent starting position coverage and prove tactical alternatives before considering activation.'
};
writeFileSync('evaluation/sigma3-tactical-isolated-review.json',JSON.stringify(audit,null,2));
console.log(JSON.stringify({control:audit.control,experimental:audit.experimental,winnerChanges:audit.changesInWinner,lengthChanges:audit.changesInLength,actionable:audit.actionableInterventions},null,2));
