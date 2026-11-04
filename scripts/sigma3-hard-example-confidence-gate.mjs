import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{legal}from'../src/engine.js';
const read=p=>JSON.parse(readFileSync('evaluation/'+p+'.json','utf8'));
const repeat=read('sigma3-hard-example-repeated-rollouts');
const certainty=read('sigma3-hard-example-repeated-quality');
const ranker=read('sigma3-hard-pairwise-value-experiment-v2');
const roots=read('sigma3-active-middle-selected');
const rollouts=read('sigma3-active-middle-outcomes');
const validation=read('sigma3-active-middle-prospective-validation');
assert.equal(repeat.results.length,18);
assert.equal(rollouts.results.length,16);
assert.equal(roots.length,4);
assert.deepEqual(roots.map(r=>r.id),[200,201,203,204]);
assert.equal(new Set(rollouts.results.map(r=>r.sequenceHash)).size,16);
assert.equal(new Set(rollouts.results.map(r=>[r.id,r.choice,r.seed].join(':'))).size,16);
assert.equal(new Set(repeat.results.map(r=>[r.id,r.choice,r.seed].join(':'))).size,18);
for(const f of roots){
 assert.equal(f.simulations200,200);
 assert.ok(f.rootCandidates[1].visits>=40);
 for(const c of f.rootCandidates)assert.ok(legal(f.s,c.action));
 for(const choice of [0,1]){
  const rows=rollouts.results.filter(x=>x.id===f.id&&x.choice===choice);
  assert.equal(rows.length,2);
  for(const row of rows){
   assert.equal(row.cutoff,false);
   assert.notEqual(row.win,row.loss);
   assert.equal(JSON.stringify(row.rootAction),JSON.stringify(f.rootCandidates[choice].action));
  }
 }
}
assert.equal(certainty.additionalContinuationGames,18);
assert.equal(certainty.anyAlternativePromotion,false);
assert.equal(validation.baselineWinSum,3);
assert.equal(validation.pairwiseV2WinSum,3);
assert.ok(ranker.cvRankerSum<ranker.cvBaselineSum);
const report={
 version:'sigma3-hard-example-confidence-gate-v1',
 newHardExampleGames:18,newProspectiveValidationGames:16,
 hardExampleRoots:3,selectedProspectiveRoots:4,
 activeRootMctsSimulations:200,
 prospectiveUniqueContinuations:16,
 observedHardExampleRootResults:certainty.rootEvaluation.map(x=>({
  id:x.id,baselineWins:x.baseline.wins,alternativeWins:x.alternative.wins,
  probabilityAlternativeBetter:x.bayesianPosteriorProbAlternativeBetter,
  credibleInterval:x.posteriorDelta95PercentInterval
 })),
 crossValidation:{baseline:ranker.cvBaselineSum,newRanker:ranker.cvRankerSum},
 prospective:{baseline:validation.baselineWinSum,
  oldHead:validation.priorValueWinSum,newRanker:validation.pairwiseV2WinSum,
  allCandidatesSameOutcome:validation.records.every(x=>x.candidateWinRates[0]===x.candidateWinRates[1])},
 promotionChecks:{researchRunsComplete:true,rootCandidatesLegal:true,
   rootIndependentBoardStates:true,moreThanTenStrongOutcomeLabels:false,
   cvNotWorse:ranker.cvRankerSum>=ranker.cvBaselineSum,
   prospectiveWinImprovement:validation.pairwiseV2WinSum>validation.baselineWinSum,
   adequateProspectiveDiscriminatingRoots:false,productionTournamentPassed:false},
 promote:false,productionEnginesUnchanged:true,
 reason:'No robust or prospective winning improvement; 101 and 105 prefer MCTS, 103 alternative has noisy 2/5 vs 0/5 evidence. Avoid new unproven heuristic.',
 caveats:['5 games per hard action is insufficient to establish true win probability',
          'Prospective four root states do not contain outcomes discriminating between candidates',
          'Offline follow-up with varied Sigma2 is not a sigma3 vs sigma2 tournament']
};
writeFileSync('evaluation/sigma3-hard-example-confidence-gate.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({newGames:34,crossValidation:report.crossValidation,
 prospective:report.prospective,promotion:report.promote},null,2));
