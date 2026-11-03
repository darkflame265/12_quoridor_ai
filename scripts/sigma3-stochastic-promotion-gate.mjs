import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{legal}from'../src/engine.js';
const read=p=>JSON.parse(readFileSync('evaluation/'+p+'.json','utf8'));
const raw=read('sigma3-midgame-diverse-outcomes');
const f=read('sigma3-midgame-diverse-features');
const m=read('sigma3-midgame-diverse-model-review');
const boards=read('sigma3-diverse-match-fixtures');
assert.equal(raw.results.length,48);
assert.equal(new Set(raw.results.map(r=>[r.id,r.choice,r.seed].join(':'))).size,48);
assert.equal(new Set(raw.results.map(r=>r.sequenceHash)).size,47);
const groups=new Map();
for(const r of raw.results){
 assert.ok(legal(boards[r.id].s,r.forcedRootAction));
 assert.equal(r.cutoff,false);assert.ok(r.diverted<=r.opportunities);
 const k=r.id+':'+r.choice;
 if(!groups.has(k))groups.set(k,[]);
 groups.get(k).push(r);
}
const different=[];
for(const id of raw.positions){
 const a=groups.get(id+':0'),b=groups.get(id+':1');
 assert.equal(a.length,2);assert.equal(b.length,2);
 if(a.filter(r=>r.rootWon).length!==b.filter(r=>r.rootWon).length)different.push(id);
}
assert.deepEqual(different,[15,23,26,28]);
assert.equal(f.records.length,24);
assert.equal(new Set([...f.trainRootIds,...f.holdoutRootIds]).size,12);
assert.equal(m.promoted,false);
const gate={
 version:'sigma3-stochastic-promotion-gate-v1',productionUnchanged:true,
 rootPositions:12,continuations:48,uniqueSequences:47,
 divergentOutcomes: different,
 legalAndCompleted:true,
 trainRoots:f.trainRootIds,holdoutRoots:f.holdoutRootIds,
 baselineWins:m.baselineHoldoutWinSum,modelWins:m.modelHoldoutWinSum,
 heldoutDelta:m.modelHoldoutWinSum-m.baselineHoldoutWinSum,
 sampleCountSufficient:false,heldoutBetter:m.modelHoldoutWinSum>m.baselineHoldoutWinSum,
 promote:false,
 reason:'No held-out win improvement; 2 rollouts per action and 4 root holdouts cannot validate new value head.'
};
writeFileSync('evaluation/sigma3-stochastic-promotion-gate.json',JSON.stringify(gate,null,2));
console.log(JSON.stringify(gate,null,2));
