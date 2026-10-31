import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {distance,moves} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-tournament-openings.json','utf8'));
test('Tournament uses 100 distinct, nonterminal and internally consistent positions',()=>{
 assert.equal(fixtures.length,100);
 assert.equal(new Set(fixtures.map(f=>f.id)).size,100);
 for(const {id,state} of fixtures){
  assert.equal(state.winner,null,id);
  assert.ok(state.turn===0||state.turn===1,id);
  assert.equal(state.walls.length+state.left[0]+state.left[1],20,id);
  assert.ok(distance(state,0)<100&&distance(state,1)<100,id);
  assert.ok(moves(state).length>0,id);
 }
});
