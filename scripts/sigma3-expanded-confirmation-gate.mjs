import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{legal}from'../src/engine.js';
const read=p=>JSON.parse(readFileSync('evaluation/'+p+'.json','utf8'));
const first=read('sigma3-midgame-independent-holdout-outcomes');
const extra=read('sigma3-midgame-holdout-confirmation-outcomes');
const features=read('sigma3-expanded-supervision');
const model=read('sigma3-expanded-value-review');
const boards=read('sigma3-independent-middle-fixtures');
const fixtureMap=new Map(boards.map(f=>[f.id,f]));
assert.equal(first.results.length,24);
assert.equal(extra.results.length,8);
assert.equal(new Set([...first.results,...extra.results].map(r=>[r.id,r.choice,r.seed].join(':'))).size,32);
assert.equal(new Set(first.results.map(r=>r.sequenceHash)).size,24);
assert.equal(new Set([...features.trainRootIds,...features.holdoutRootIds]).size,16);
assert.deepEqual(features.holdoutRootIds,[25,27,29,34]);
const comparison=[];
for(const id of features.holdoutRootIds){
 const byChoice=[0,1].map(choice=>{
  const a=first.results.filter(r=>r.id===id&&r.choice===choice);
  assert.equal(a.length,3);
  const b=extra.results.filter(r=>r.id===id&&r.choice===choice);
  assert.equal(b.length,id===27||id===29?2:0);
  const records=[...a,...b];
  for(const r of records){
   assert.equal(r.cutoff,false);
   assert.equal(r.rootWon,!r.rootLoss);
   assert.ok(r.plies>=1&&r.plies<=120);
   assert.ok(legal(fixtureMap.get(id).s,r.forcedRootAction));
  }
  const wins=records.filter(r=>r.rootWon).length;
  return {choice,n:records.length,wins,winRate:wins/records.length,uniqueSequences:new Set(records.map(r=>r.sequenceHash)).size};
 });
 const evaluated=model.evaluation.find(r=>r.id===id);
 assert.ok(evaluated);
 comparison.push({id,choices:byChoice,baselineChoice:0,modelChoice:evaluated.modelChoice,
  baselineWinRate:byChoice[0].winRate,
  modelWinRate:byChoice[evaluated.modelChoice].winRate,
  delta:byChoice[evaluated.modelChoice].winRate-byChoice[0].winRate});
}
const gate={
 version:'sigma3-expanded-holdout-confirmation-v1',
 heldoutRootIds:features.holdoutRootIds,
 trainRootIds:features.trainRootIds,
 prospectiveHoldoutGames:first.results.length,
 targetedFollowupGames:extra.results.length,
 holdoutUniqueSequences:new Set(first.results.map(r=>r.sequenceHash)).size,
 distinctBoardStates:boards.length,
 comparisons:comparison,
 positivePositions:comparison.filter(r=>r.delta>0).map(r=>r.id),
 negativePositions:comparison.filter(r=>r.delta<0).map(r=>r.id),
 totalBaselineWins:comparison.reduce((s,r)=>s+r.baselineWinRate,0),
 totalModelWins:comparison.reduce((s,r)=>s+r.modelWinRate,0),
 promoted:false,
 gates:{trainHoldoutDisjoint:true,
  allLegalAndTerminal:true,
  separateNewBoardPositions:true,
  enoughIndependentHoldoutRoots:features.holdoutRootIds.length>=12,
  enoughVariedSamplesPerCandidate:comparison.every(r=>r.choices.every(x=>x.n>=10)),
  observedMeanWinRateIncrease:comparison.reduce((s,r)=>s+r.delta,0)>0},
 interpretation:'Model frozen during targeted confirmation; significance remains unestablished and deterministic production strength untested. Do not promote.',
};
writeFileSync('evaluation/sigma3-expanded-confirmation-gate.json',JSON.stringify(gate,null,2));
console.log(JSON.stringify(gate,null,2));
