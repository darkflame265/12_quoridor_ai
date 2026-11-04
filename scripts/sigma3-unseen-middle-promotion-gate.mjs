import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{legal}from'../src/engine.js';
const read=f=>JSON.parse(readFileSync('evaluation/'+f+'.json','utf8'));
const source=read('sigma3-unseen-middle-audited');
const data=read('sigma3-unseen-middle-outcomes');
const features=read('sigma3-unseen-middle-features');
const result=read('sigma3-frozen-value-external-holdout');
const previous=read('sigma3-expanded-supervision');
assert.equal(source.length,8);
assert.equal(data.results.length,32);
assert.equal(features.records.length,16);
assert.equal(result.results.length,8);
const ids=source.map(x=>x.id);
assert.equal(new Set(ids).size,8);
const priorIds=new Set([...previous.trainRootIds,...previous.holdoutRootIds]);
assert.ok(ids.every(id=>!priorIds.has(id)));
assert.equal(new Set(data.results.map(r=>r.sequenceHash)).size,32);
assert.ok(data.results.every(r=>!r.cutoff && r.win!==r.loss && r.diverted<=r.eligible));
assert.equal(new Set(data.results.map(r=>[r.id,r.choice,r.seed].join('/'))).size,32);
for(const f of source){
 for(const choice of [0,1]){
  const action=f.rootCandidates[choice].action;
  assert.ok(legal(f.s,action));
  const rows=data.results.filter(r=>r.id===f.id&&r.choice===choice);
  assert.equal(rows.length,2);
  assert.ok(rows.every(r=>JSON.stringify(r.rootAction)===JSON.stringify(action)));
 }
}
const distinct=ids.filter(id=>{
 const r=result.results.find(x=>x.id===id);
 return r.candidateWinRates[0]!==r.candidateWinRates[1];
});
assert.equal(distinct.length,3);
const gate={
 version:'sigma3-independent-middle-promotion-gate-v1',
 distinctRootPositions:ids.length,originalTrainingRoots:previous.trainRootIds.length,
 researchContinuationGames:data.results.length,uniqueContinuations:32,
 outcomeDiscriminatingRoots:distinct,
 baselineObservedWinRate:result.baselineWinSum/ids.length,
 modelObservedWinRate:result.modelWinSum/ids.length,
 baselineWinSum:result.baselineWinSum,modelWinSum:result.modelWinSum,
 modelWinDelta:result.modelWinSum-result.baselineWinSum,
 regressionPositions:result.results.filter(r=>r.winDelta<0).map(r=>r.id),
 gates:{noExactRootIdsOverlap:true,allGamesCompleted:true,
  rootActionsLegal:true,sequencesDiverse:true,
  heldoutNotWorse:result.modelWinSum>=result.baselineWinSum,
  enoughIndependentRootPositions:ids.length>=16,
  enoughOutcomeSamplesPerCandidate:false,
  productionTournamentVerified:false},
 promote:false,
 rationale:'Observed win sum regressed 4.5 to 4.0 on eight unseen positions. Fixed value head rejected; no sigma2/sigma3 engine modifications.',
 caveats:['Two rollouts per candidate, not enough for robust win probability estimates',
 'Some board states may share historical source-game structure',
 'Randomized Sigma2 continuations do not measure Sigma3-vs-Sigma2 tournament win rates']
};
writeFileSync('evaluation/sigma3-unseen-middle-promotion-gate.json',JSON.stringify(gate,null,2));
console.log(JSON.stringify(gate,null,2));
