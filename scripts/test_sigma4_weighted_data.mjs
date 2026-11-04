import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
const data=JSON.parse(readFileSync('evaluation/sigma4-natural-weighted-games.json','utf8'));
const mined=JSON.parse(readFileSync('evaluation/sigma4-weighted-mined.json','utf8'));
const snap=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
const seen=new Set();
for(const g of data.games){
 assert.equal(g.openingPrefix.length,0);
 assert.ok(!g.cutoff);
 let state=initial();
 for(let i=0;i<g.trace.length;i++){
  const t=g.trace[i];
  assert.equal(t.ply,i);
  assert.equal(snap(state),snap(t.state));
  assert.ok(legal(state,t.action));
  state=apply(state,t.action);
 }
 assert.equal(state.winner,g.winner);
 assert.equal(g.plies,g.trace.length);
 assert.ok(!seen.has(g.seed+':'+g.match+':'+g.sigma3Side));
 seen.add(g.seed+':'+g.match+':'+g.sigma3Side);
}
const train=new Set(mined.train.map(r=>r.stateKey)),held=new Set(mined.holdout.map(r=>r.stateKey));
assert.ok([...train].every(k=>!held.has(k)));
assert.equal(mined.gates.readyToTrain,false);
assert.ok(mined.summary.splitConflicts>=0);
assert.equal(mined.summary.recordedGames,data.games.length);
console.log('PASS SIGMA4 weighted: natural full-game replay, legal moves, disjoint board-state holdout, training blocked');
