import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=n=>JSON.parse(readFileSync('evaluation/'+n,'utf8'));
const sha=x=>createHash('sha256').update(readFileSync(x)).digest('hex');
const sample=read('sigma4-strong-selfplay-midgames-20261106.json');
const tournament=read('sigma4-strong-selfplay-onnx-tournament-20261106.json');
const audit=read('sigma4-strong-selfplay-onnx-audit-20261106.json');
const values=read('sigma4-strong-selfplay-value-calibration-20261106.json');
const research=read('sigma4-value-residual-onnx-export-20261106.json');
const rootSha=sha('vendor/sigma-quoridor/models/best.onnx');
const correctionSha=sha('evaluation/sigma4-value-residual-research-20261106.onnx');
assert.equal(sample.openings.length,11);
assert.equal(sample.attempts.length,16);
assert.equal(tournament.games.length,60);
assert.equal(audit.source.selectedStarts,10);
assert.equal(audit.overall.headToHeadGames,20);
assert.equal(audit.overall.externalGames,40);
assert.equal(values.overall.independentStartingBoards,10);
assert.equal(values.holdout.independentStartingBoards,3);
assert.equal(research.onnxSha256,correctionSha);
assert.equal(values.baseModelSha256,rootSha);
assert.equal(values.correctedModelSha256,correctionSha);
assert(audit.gates.fullGameReplayLegal&&audit.gates.allGamesFinished);
assert(audit.overall.draws===0);
assert.equal(audit.overall.correctedHeadWins+audit.overall.originalHeadWins,20);
assert.equal(audit.overall.externalPairs,20);
assert.equal(audit.bySplit.development.sourceBoards,7);
assert.equal(audit.bySplit.holdout.sourceBoards,3);
const checks={
 broadFixtureCount:values.overall.independentStartingBoards>=30,
 moreHeadWins:audit.overall.correctedHeadWins>audit.overall.originalHeadWins,
 moreExternalWins:audit.overall.correctedExternalWins>audit.overall.originalExternalWins,
 betterNewHoldoutBrier:values.holdout.correctedBrier<values.holdout.networkBrier,
 betterAggregateBrier:values.overall.correctedBrier<values.overall.networkBrier,
 betterP95:audit.latency.corrected.p95Ms<=audit.latency.original.p95Ms,
 strict500ms:audit.gates.correctedStrictlyUnder500
};
const approve=Object.values(checks).every(Boolean);
assert(!approve,'unexpected improvement: reassess promotion manually before deployment');
const gate={
 version:'sigma4-strong-selfplay-research-promotion-gate-v1',
 sourceGroups:sample.openings.length,
 usedSourceGroups:audit.source.selectedStarts,
 distinctHoldoutGroups:values.holdout.independentStartingBoards,
 trueHeadToHead:audit.overall,
 latency:audit.latency,
 originalOnnxSha256:rootSha,
 researchOnnxSha256:correctionSha,
 checks,
 approval:false,
 reasons:['Stronger policy-generated middle-game out-of-distribution Brier regressed',
  'Corrected model lost direct head-to-head comparison',
  'External matched games show no win advantage',
  'Mean and p95 latency increased and strict 500ms move limit not demonstrated',
  'Independent source board count too small for a reliable generalization claim'],
 noProductionCodeTouched:true
};
writeFileSync('evaluation/sigma4-strong-selfplay-promotion-gate-20261106.json',JSON.stringify(gate,null,2)+'\n');
console.log('PASS RESEARCH PROMOTION GATE',JSON.stringify({checks,approval:gate.approval}));
