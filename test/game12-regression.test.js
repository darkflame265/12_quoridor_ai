import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {apply,legal,distance} from '../src/engine.js';
const rows=JSON.parse(readFileSync(new URL('./game12-positions.json',import.meta.url),'utf8'));
test('Game12 critical decisions remain legal and distances replay correctly',()=>{
 for(const r of rows){
  assert.equal(legal(r.state,r.action),true,'illegal ply '+r.ply);
  assert.deepEqual([0,1].map(t=>distance(r.state,t)),r.before,'before '+r.ply);
  const next=apply(r.state,r.action);
  assert.deepEqual([0,1].map(t=>distance(next,t)),r.after,'after '+r.ply);
 }
});
test('Game12 opponent wall replies expose route collapse',()=>{
 const pairs=[[13,14],[17,18],[19,20],[21,22]];
 for(const [ours,theirs] of pairs){
  const a=rows.find(x=>x.ply===ours),b=rows.find(x=>x.ply===theirs);
  assert.ok(a&&b);
  assert.equal(b.action.type,'wall');
  assert.ok(b.after[0]-b.before[0]>=3,'expected severe detour after ply '+theirs);
 }
});
