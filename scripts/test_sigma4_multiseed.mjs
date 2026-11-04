import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legal} from '../src/engine.js';
const read=x=>JSON.parse(readFileSync(x,'utf8'));
const repeated=read('evaluation/sigma4-repeated-branches-paired.json');
const mined=read('evaluation/sigma4-research-mined.json');
const gate=read('evaluation/sigma4-multiseed-evidence-paired.json');
const learning=read('evaluation/sigma4-policy-training-gate-paired.json');
const roots=new Map(mined.candidateBranches.map(r=>[r.id,r]));
assert.equal(repeated.trials.length,repeated.planned);
assert.deepEqual(repeated.settings.seedList,[24011,24029,24047]);
assert.equal(repeated.settings.reuse,false);
assert.equal(repeated.settings.deterministic,true);
const ids=[...new Set(repeated.trials.map(t=>t.id))];
assert.equal(ids.length,2);
for(const id of ids){
 const root=roots.get(id);
 assert.ok(root&&root.split==='train');
 for(const seed of repeated.settings.seedList){
  const pair=repeated.trials.filter(t=>t.id===id&&t.seed===seed).sort((a,b)=>a.choice-b.choice);
  assert.equal(pair.length,2);
  assert.deepEqual(pair.map(x=>x.choice),[0,1]);
  for(const t of pair){
   assert.deepEqual(t.forcedAction,root.forcedActions[t.choice]);
   assert.ok(legal(root.rootState,t.forcedAction));
   assert.equal(t.rootKey,root.rootKey);
   assert.equal(t.cutoff,false);
   assert.ok(Number.isInteger(t.experimentalDeviations)&&t.experimentalDeviations>=0);
  }
 }
}
assert.equal(gate.completedRepeatedTrials,repeated.trials.length);
assert.equal(gate.canTrain,false);
assert.equal(learning.modelSaved,false);
assert.equal(learning.trainRoots,2);
assert.equal(learning.holdoutRoots,0);
console.log('PASS SIGMA4 matched random streams, legal forced roots, paired candidate/seed, holdout and training blocks');
