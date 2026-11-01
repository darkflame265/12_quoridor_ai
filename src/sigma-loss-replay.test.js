import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legal,apply} from './engine.js';

test('Sigma loss replay remains legal and reproducible on seed 064',()=>{
 const report=JSON.parse(readFileSync(new URL('../reports/atlas6-reborn/sigma-loss-replay-vs53-064.json',import.meta.url),'utf8'));
 const game=report.games.find(g=>g.verdict==='loss');
 assert.equal(game.fixture,'seed-20261101-064');
 assert.equal(game.sigmaSide,0);
 assert.ok(game.trace.length>0);
 let state=structuredClone(game.opening);
 for(const [i,ply] of game.trace.entries()){
  assert.equal(ply.side,state.turn,'side at ply '+i);
  assert.deepEqual(ply.position,state,'position at ply '+i);
  assert.ok(legal(state,ply.action),'legal action at ply '+i);
  state=apply(state,ply.action);
 }
 assert.deepEqual(state,game.finalState);
 assert.equal(state.winner,1);
});
