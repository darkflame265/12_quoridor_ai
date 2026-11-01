import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {distance,moves} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'));
test('balanced openings have nontrivial distances and distinct states',()=>{
 assert.equal(fixtures.length,100);
 assert.equal(new Set(fixtures.map(f=>f.id)).size,100);
 for(const {id,state} of fixtures){
  assert.equal(state.winner,null,id);
  const a=distance(state,0),b=distance(state,1);
  assert.ok(a>=4&&b>=4&&Math.abs(a-b)<=3,id);
  assert.ok(moves(state).length>0,id);
  assert.equal(state.walls.length+state.left[0]+state.left[1],20,id);
 }
});
