import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {initial,clone,apply,legal} from '../src/engine.js';
const read=x=>JSON.parse(readFileSync(x,'utf8'));
const existing=read('evaluation/sigma4-research-games.json');
const extended=read('evaluation/sigma4-research-extended-games.json');
const selfplay=read('evaluation/sigma4-selfplay-games.json');
const combined=read('evaluation/sigma4-diversity-coverage.json');
function snap(s){return JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);}
for(const doc of [extended,selfplay]){
 for(const game of doc.games){
  let s=initial();
  for(const a of game.opening){assert.ok(legal(s,a));s=apply(s,a);}
  for(const step of game.trace){
   assert.equal(snap(s),snap(step.state));
   assert.ok(legal(s,step.action));
   if(doc===selfplay)assert.equal(step.variant,'sigma3');
   else assert.equal(step.variant,step.side===game.sigma3Side?'sigma3':'sigma2');
   s=apply(s,step.action);
  }
  assert.equal(s.winner,game.winner);
  assert.equal(game.totalPlies,game.opening.length+game.trace.length);
  assert.equal(game.cutoff,false);
 }
}
assert.equal(existing.games.length,8);
assert.equal(extended.games.length,4);
assert.equal(selfplay.games.length,2);
assert.equal(combined.totalGames,14);
assert.equal(combined.uniqueWholeGameSequences,12);
assert.equal(combined.uniqueOpeningFamilies,8);
assert.equal(combined.uniqueDecisionStates,698);
assert.deepEqual([...new Set(extended.games.map(g=>g.sigma3Side))].sort(),[0,1]);
const p='evaluation/sigma4-repeated-branches-paired.json';
if(existsSync(p)){
 const d=read(p);
 const keys=new Set();
 for(const t of d.trials){
  assert.ok(d.settings.seedList.includes(t.seed));
  const id=[t.id,t.seed,t.choice].join(':');
  assert.ok(!keys.has(id));
  keys.add(id);
  assert.equal(t.split,'train');
  assert.equal(typeof t.experimentalDeviations,'number');
 }
 if(d.trials.length===d.planned){
  for(const id of new Set(d.trials.map(t=>t.id)))for(const seed of d.settings.seedList)
   assert.deepEqual(d.trials.filter(t=>t.id===id&&t.seed===seed).map(t=>t.choice).sort(),[0,1]);
 }
}
console.log('PASS SIGMA4 expanded: game replay, selfplay identity, paired roles, independent openings and legal branches');
