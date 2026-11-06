import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';

const read=x=>JSON.parse(readFileSync('evaluation/'+x,'utf8'));
const source=read('sigma4-diverse-strong-midgame-audit-20261106.json');
const observed=read('sigma4-diverse-strong-outcome-audit-20261106.json');
const calibrated=read('sigma4-diverse-strong-onnx-calibration-20261106.json');
const odd=read('sigma4-diverse-strong-odd-calibration-20261106.json');
const prior=read('sigma4-value-residual-onnx-export-20261106.json');
const hash=x=>createHash('sha256').update(readFileSync(x)).digest('hex');
assert(source.verifiedLegal&&source.uniqueSourcePositions===19);
assert.equal(source.priorDatasetBoardOverlaps,0);
assert(source.pathGapMin>=-2&&source.pathGapMax<=2);
assert.equal(observed.policyGames,64);
assert.equal(observed.analyzedIndependentSources,16);
assert.equal(observed.holdoutTrainingExcluded,5);
assert.equal(observed.developmentTrainingReviewCandidates,9);
assert.equal(observed.developmentAmbiguousExcluded,2);
assert.equal(calibrated.all.uniquePositions,16);
assert.equal(calibrated.holdout.uniquePositions,5);
assert.equal(calibrated.all.continuations,64);
assert.equal(odd.all.correlatedOddSnapshots,14);
assert(odd.holdout.correlatedOddSnapshots>=3);
assert.equal(prior.onnxSha256,hash('evaluation/sigma4-value-residual-research-20261106.onnx'));
assert.equal(calibrated.modelHashOriginal,hash('vendor/sigma-quoridor/models/best.onnx'));
assert.equal(calibrated.modelHashCorrected,hash('evaluation/sigma4-value-residual-research-20261106.onnx'));
const development=observed.byPosition.filter(x=>x.split==='development'&&x.policyUnanimous);
const losers=development.filter(x=>x.wins===0).length;
const winners=development.filter(x=>x.wins===4).length;
const holdout=observed.byPosition.filter(x=>x.split==='holdout');
const negativeHoldout=holdout.filter(x=>x.wins===0).length;
const grades={
 fullGameLegal:true,
 noPreviousPositionsReused:true,
 sourceGroupsAtLeast50:source.uniqueSourcePositions>=50,
 enoughCandidateLosingPositions:losers>=10,
 enoughHoldoutLosingPositions:negativeHoldout>=5,
 bothGroupsCalibrationBetter:
   calibrated.development.correctedBrier<calibrated.development.originalBrier&&
   calibrated.holdout.correctedBrier<calibrated.holdout.originalBrier,
 counterPerspectiveCalibrationBetter:
   odd.all.correctedBrier<odd.all.originalBrier,
 playingStrengthImprovementDemonstrated:false,
 strict500msMoveLimitDemonstrated:false
};
const report={
 version:'sigma4-diverse-strong-data-readiness-gate-v1',
 source:{attempts:source.attempts,independentStarts:source.uniqueSourcePositions,
  originalSourcePolicyCounts:source.bySourcePolicy,priorOverlap:source.priorDatasetBoardOverlaps,
  labeledStartPositions:observed.analyzedIndependentSources,
  labeledDevelopmentPositions:observed.developmentGroups,
  labeledHoldoutPositions:observed.holdoutGroups,
  correlatedAdditionalOddSnapshots:17,
  observedFullGames:observed.policyGames,
  unanimous:observed.unanimouslyObserved,
  ambiguous:observed.ambiguousObserved,
  developmentReviewCandidates:observed.developmentTrainingReviewCandidates,
  developmentReviewPositive:winners,developmentReviewNegative:losers,
  holdoutNegativeBoards:negativeHoldout},
 calibration:{all:calibrated.all,development:calibrated.development,
  holdout:calibrated.holdout,conditionalOdd:odd.all},
 gates:grades,
 decisions:{enoughDataForFullNNTraining:false,calibrationUpgradeApproved:false,
  defaultEngineSwitchApproved:false,
  rationale:['Only 19 distinct source board groups; label-quality review must not count correlated game continuations as independent data',
   'Eight of nine unanimously observed development boards are winning, and all five holdout boards are winning',
   'Independent validation is not balanced enough to test losing-position generalization',
   'Old correction regresses across aggregate development and conditional opposite-to-move snapshots',
   'No new blind paired-match wins or strict deadline evidence']},
 futureSamplingPriority:['Generate both odd and even ply start states with separate independent policy rollouts',
  'Use strong opponents and tactically distinct opening policies, not just variants sharing the same neural base',
  'Seek losing and contested outcomes rather than screening solely by shortest-path distance',
  'Preserve entire trajectory group when splitting training/holdout; adjudicate hard cases independently'],
 modelSha256:{original:calibrated.modelHashOriginal,correction:calibrated.modelHashCorrected}};
assert(Object.values(grades).some(v=>!v));
writeFileSync('evaluation/sigma4-diverse-strong-data-readiness-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS DATA READINESS GATE',JSON.stringify({sources:report.source,checks:report.gates,
 decisions:report.decisions},null,2));
