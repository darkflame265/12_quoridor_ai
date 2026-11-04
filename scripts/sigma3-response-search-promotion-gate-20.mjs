import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
const d=JSON.parse(readFileSync('evaluation/sigma3-response-search-vs-sigma2-20.json','utf8'));
const scan=JSON.parse(readFileSync('evaluation/sigma3-response-search-isolated-root-sweep.json','utf8'));
const audit=JSON.parse(readFileSync('evaluation/sigma3-response-search-decision-audit.json','utf8'));
assert.equal(d.totalGames,20);
assert.equal(d.games.length,20);
assert.equal(new Set(d.games.map(r=>r.id+'-'+r.arm)).size,20);
assert.ok(d.games.every(g=>!g.cutoff&&g.rootWon!==g.rootLost&&g.plies<=120));
assert.equal(scan.positions,16);
assert.ok(audit.cases.length>=3);
const grouped=d.ids.map(id=>{
 const base=d.games.find(x=>x.id===id&&x.arm==='base');
 const experimental=d.games.find(x=>x.id===id&&x.arm==='tactical');
 assert.ok(base&&experimental&&base.rootSide===experimental.rootSide);
 return{id,baselineWon:base.rootWon,tacticalWon:experimental.rootWon,
  delta:+experimental.rootWon-(+base.rootWon),
  baselinePlies:base.plies,tacticalPlies:experimental.plies,
  tacticalChanges:experimental.changes,extraTacticalMs:experimental.extraTacticalMs,
  averageAdditionalMsPerSigmaDecision:experimental.extraTacticalMs/experimental.sigmaMoves,
  sigmaMoves:experimental.sigmaMoves};
});
const baseWins=grouped.filter(x=>x.baselineWon).length;
const trialWins=grouped.filter(x=>x.tacticalWon).length;
const regression=grouped.filter(x=>x.delta<0).map(x=>x.id);
const improvement=grouped.filter(x=>x.delta>0).map(x=>x.id);
const allTrialTurns=grouped.reduce((s,x)=>s+x.sigmaMoves,0);
const allTrialMs=grouped.reduce((s,x)=>s+x.extraTacticalMs,0);
const totalChanges=grouped.reduce((s,x)=>s+x.tacticalChanges.length,0);
const gate={
 version:'sigma3-response-search-paired-promotion-gate-v1',
 status:'experimental-only',
 experiment:'PUCT-200 sigma3 vs sigma2 from 6 middle-game states. Identical fixed deterministic seed per paired root; not a full opening 9x9 tournament.',
 pairedGames:20,roots:grouped.length,
 baseline:{wins:baseWins,losses:grouped.length-baseWins,winRate:baseWins/grouped.length},
 experimental:{wins:trialWins,losses:grouped.length-trialWins,winRate:trialWins/grouped.length},
 pairedImprovements:improvement,pairedRegressions:regression,
 actionOverrides:totalChanges,analyzedSigmaTurns:allTrialTurns,
 extraTacticalTotalMs:allTrialMs,
 averageExtraMsPerSigmaTurn:allTrialMs/allTrialTurns,
 perFixture:grouped,
 gates:{allPairedGamesCompleted:true,noCutoffs:true,
 improvedHeadToHeadWinRate:trialWins>baseWins,
 noPairedRegression:regression.length===0,
 enoughIndependentStartPositions:grouped.length>=20,
 maximumDecisionOverheadVerified:false,
 separateOpeningToEndGamesTested:false},
 promote:false,
 rationale:'Candidate remains experimental until an independent promotion gate proves no regressions and higher win rate.',
 limitations:['Ten starting states are a small, non-random sample',
 'Per-ply tactical search is beam-limited; best defender response is chosen within static top-N moves',
 'Some root states were already used during iterative analysis, so this is not independent holdout',
 'Further trial in full games and more independent positions needed before promotion']};
writeFileSync('evaluation/sigma3-response-search-promotion-gate-20.json',JSON.stringify(gate,null,2));
console.log(JSON.stringify({base:gate.baseline,trial:gate.experimental,regression,improvement,
 changes:totalChanges,extraMsPerSigmaTurn:gate.averageExtraMsPerSigmaTurn,
 promote:gate.promote},null,2));
