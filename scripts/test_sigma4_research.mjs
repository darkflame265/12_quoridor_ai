import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,clone,apply,legal} from '../src/engine.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const games=read('evaluation/sigma4-research-games.json').games;
const mined=read('evaluation/sigma4-research-mined.json');
const branches=read('evaluation/sigma4-counterfactual-trials.json').trials;
const gate=read('evaluation/sigma4-research-gate.json');
const training=read('evaluation/sigma4-policy-training-gate.json');
const snap=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
assert.equal(games.length,8);
assert.equal(new Set(games.map(g=>g.sequenceHash)).size,7);
const bySeed=new Map();
for(const g of games){
 if(!bySeed.has(g.seed))bySeed.set(g.seed,[]);
 bySeed.get(g.seed).push(g);
 let s=initial(),h=[];
 for(const a of g.opening){assert.ok(legal(s,a));h.push(clone(s));s=apply(s,a);}
 for(const step of g.trace){
  assert.equal(snap(s),snap(step.state),'trace state diverged at '+g.seed+':'+step.ply);
  assert.ok(legal(s,step.action));
  h.push(clone(s));s=apply(s,step.action);
 }
 assert.equal(s.winner,g.winner);
 assert.equal(g.totalPlies,g.opening.length+g.trace.length);
}
assert.equal(bySeed.size,4);
for(const group of bySeed.values()){
 assert.equal(group.length,2);
 assert.deepEqual(group.map(g=>g.sigma3Side).sort(),[0,1]);
 assert.deepEqual(group[0].opening,group[1].opening);
}
assert.ok(mined.decisions.length>=100);
assert.equal(mined.summary.nonduplicatedDecisionStates,mined.decisions.length);
assert.ok(mined.candidateBranches.every(c=>c.forcedActions.every(a=>legal(c.rootState,a))));
assert.equal(branches.length,4);
for(const t of branches){
 const m=mined.candidateBranches.find(c=>c.id===t.id);
 assert.ok(m);
 assert.equal(t.rootKey,m.rootKey);
 assert.deepEqual(t.forcedRootAction,m.forcedActions[t.choice]);
 assert.equal(t.cutoff,false);
}
assert.equal(gate.promoteSigma4,false);
assert.equal(training.modelSaved,false);
assert.deepEqual(gate.split.trainSeeds.filter(s=>gate.split.holdoutSeeds.includes(s)),[]);
console.log('PASS SIGMA4: legal full replay, paired roles, distinct-opening split, counterfactual roots, nonpromotion');
