import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const E='evaluation/';
const load=n=>JSON.parse(readFileSync(E+n,'utf8'));
const jsonl=n=>readFileSync(E+n,'utf8').trim().split('\n').map(JSON.parse);
const sha=n=>createHash('sha256').update(readFileSync(n)).digest('hex');

const rollout=load('sigma4-crosspolicy-independent-20261106.json');
const observed=load('sigma4-crosspolicy-audit-20261106.json');
const training=load('sigma4-value-residual-research-20261106.json');
const exported=load('sigma4-value-residual-onnx-export-20261106.json');
const real=load('sigma4-value-residual-onnx-realboards-20261106.json');
const matches=load('sigma4-value-research-onnx-matched-audit-20261106.json');
const correctedDev=jsonl('sigma4-crosspolicy-development-unanimous-20261106.jsonl');
const ambiguousDev=readFileSync(E+'sigma4-crosspolicy-development-ambiguous-20261106.jsonl','utf8').trim();
const rootBaseSha=sha('vendor/sigma-quoridor/models/best.onnx');

assert.equal(rollout.games.length,64);
assert.equal(observed.totals.uniquePositions,16);
assert.equal(observed.totals.policyGames,64);
assert.equal(observed.development.uniquePositions,12);
assert.equal(observed.holdout.uniquePositions,4);
assert.equal(observed.candidateCount,correctedDev.length);
assert.equal(observed.rejectedAmbiguousCount,0);
assert.equal(ambiguousDev,'');
assert.equal(training.oldDevelopmentCount,308);
assert.equal(training.newUnanimousDevelopmentCount,12);
assert.equal(training.newHoldoutCount,4);
assert.equal(training.oldHoldoutCount,89);
assert(training.holdoutNeverUsedToSelectEpoch);
const ids=new Set(correctedDev.map(p=>p.positionId));
assert.equal(ids.size,12);
const holdout=new Set(observed.positionSummaries.filter(p=>p.split==='holdout').map(p=>p.positionId));
for(const id of ids)assert(!holdout.has(id));
const knownOldDev=new Set(jsonl('sigma4-value-development-positions-20261105.jsonl').map(p=>p.positionId));
const knownOldHold=new Set(jsonl('sigma4-value-holdout-positions-20261105.jsonl').map(p=>p.positionId));
for(const id of ids)assert(!knownOldHold.has(id));
for(const id of holdout)assert(!knownOldDev.has(id)&&!knownOldHold.has(id));
assert.equal(exported.checkpointSha256,sha(E+'sigma4-value-residual-research-20261106.pt'));
assert.equal(exported.onnxSha256,sha(E+'sigma4-value-residual-research-20261106.onnx'));
assert.equal(exported.onnxSha256,real.correctionOnnxSha256);
assert.equal(rootBaseSha,real.baseModelSha256);
assert(exported.maxAbsoluteTorchOnnxError<2e-6);
assert(exported.exportValidated);
assert(real.valuesMatchTrainingEvaluation);
assert(real.tests.oldHoldout.correctedBrier<real.tests.oldHoldout.originalBrier);
assert(real.tests.newHoldout.correctedBrier<real.tests.newHoldout.originalBrier);
assert(Math.abs(training.oldHoldout.prototypeBrier-real.tests.oldHoldout.correctedBrier)<2e-5);
assert(Math.abs(training.newHoldout.prototypeBrier-real.tests.newHoldout.correctedBrier)<2e-5);
assert(matches.gates.all32GamesComplete&&matches.gates.allMovesLegal);
assert.equal(matches.pairedComparisons.length,16);
assert(matches.gates.productionApproved===false);
const decision={
 version:'sigma4-residual-evaluation-acceptance-gate-v1',
 researchModel:{
  oldBaseSha256:rootBaseSha,
  correctionOnnxSha256:exported.onnxSha256,
  trainedOnOldDevelopmentPositions:training.oldDevelopmentCount,
  trainedOnNewUnanimousDevelopmentPositions:training.newUnanimousDevelopmentCount,
  newPolicyGames:observed.totals.policyGames,
  newIndependentPositions:observed.totals.uniquePositions,
  ambiguousHoldoutPositions:observed.holdout.conflicted
 },
 independentCalibration:{
  oldHoldout:real.tests.oldHoldout,
  newHoldout:real.tests.newHoldout
 },
 independentMatchPilot:{
  original:matches.variants.original,
  corrected:matches.variants.corrected,
  paired:matches.totals
 },
 decisions:{
  researchTrainingComplete:true,
  separateONNXExportVerified:true,
  productionDefaultUnchanged:true,
  productionPromotionApproved:false,
  reasons:['Only four independent starting positions in the policy match comparison',
   'New correction head is not drop-in compatible with original base-model input interface',
   'Requires reliable paired win and p95 latency improvements before deployment',
   'Outcome labels reflect policies, not exact optimal play']
 }};
writeFileSync(E+'sigma4-residual-evaluation-acceptance-20261106.json',JSON.stringify(decision,null,2)+'\n');
console.log('PASS RESIDUAL MODEL GATE',JSON.stringify({calibration:decision.independentCalibration,
 matches:decision.independentMatchPilot.paired,original:matches.variants.original.wins,
 corrected:matches.variants.corrected.wins,promotion:false}));
