import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal,clone} from '../src/engine.js';
const E='evaluation/';
const j=p=>JSON.parse(readFileSync(E+p,'utf8'));
const lines=p=>readFileSync(E+p,'utf8').trim().split('\n').map(JSON.parse);
const meta=j('sigma4-value-dataset-manifest-20261105.json');
const result=j('sigma4-value-calibration-20261105.json');
const fit=j('sigma4-value-calibrator-prototype-20261105.json');
const train=lines('sigma4-value-development-positions-20261105.jsonl');
const test=lines('sigma4-value-holdout-positions-20261105.jsonl');
const scored=lines('sigma4-value-scored-20261105.jsonl');
const hard=lines('sigma4-value-hard-examples-development-20261105.jsonl');
const groupBy=Object.fromEntries(meta.fixtureGroups.map(x=>[x.hash,x.split]));
assert.equal(meta.fixtureGroups.length,11);
assert.equal(meta.sourceGames,80);
assert.equal(meta.overlap.rawPositionSamples,960);
assert.equal(meta.overlap.duplicated,539);
assert.equal(meta.overlap.excludedAmbiguousPositions,24);
assert.equal(meta.overlap.crossSplitObserved,0);
assert.equal(train.length,result.development.n);
assert.equal(test.length,result.holdout.n);
assert.equal(scored.length,train.length+test.length);
assert.equal(hard.length,result.hardDevelopmentCount);
assert.equal(hard.length,17);
assert.equal(result.modelSha256,createHash('sha256').update(readFileSync('vendor/sigma-quoridor/models/best.onnx')).digest('hex'));
const keys=new Set();
for(const [split,items] of [['development',train],['holdout',test]]){
 for(const row of items){
  assert.equal(groupBy[row.fixtureHash],split);
  assert(!keys.has(row.positionId),'duplicate/leaked position');
  keys.add(row.positionId);
  assert([0,1].includes(row.toMove));
  assert([-1,1].includes(row.actualValue));
  assert.equal(row.toMove===row.gameWinner,row.actualValue===1);
 }
}
for(const row of scored){
 assert(keys.has(row.positionId));
 assert(row.probability>=0&&row.probability<=1);
 assert([-1,1].includes(row.actualValue));
 assert(Math.abs(row.value-2*row.probability+1)<.00001||row.probability<=.000001||row.probability>=.999999);
}
const trainingIds=new Set(train.map(x=>x.positionId));
for(const row of hard){
 assert(trainingIds.has(row.positionId));
 assert(row.state&&row.state.walls&&Array.isArray(row.state.p));
 assert(row.squaredError>=.5625);
 assert.equal(row.split,'development');
}
assert(fit.holdoutUsedForFit===false);
assert(fit.holdout.brierCalibrated<fit.holdout.brierOriginal);
assert(fit.holdout.brierCalibrated>result.holdoutConstantFromDevelopment.brier);
assert(result.holdout.brier>result.development.brier);
assert(result.development.n>result.holdout.n);
const audit={version:'sigma4-value-audit-v1',sourceGames:meta.sourceGames,
 independentOpeningGroups:meta.fixtureGroups.length,
 developmentPositions:train.length,holdoutPositions:test.length,
 ambiguousPositionsExcluded:meta.overlap.excludedAmbiguousPositions,
 modelHash:result.modelSha256,
 holdoutBrier:result.holdout.brier,
 holdoutCalibratedBrier:fit.holdout.brierCalibrated,
 holdoutConstantBrier:result.holdoutConstantFromDevelopment.brier,
 trainingHardExamples:hard.length,
 stageBreakdown:Object.fromEntries(Object.entries(result.byGameStage).map(([key,x])=>[key,{development:x.development?.n??0,holdout:x.holdout?.n??0}])),
 resultsValidated:true,retrainingApproved:false,productionPromotionApproved:false};
writeFileSync(E+'sigma4-value-audit-20261105.json',JSON.stringify(audit,null,2)+'\n');
console.log('PASS VALUE AUDIT',JSON.stringify(audit));
