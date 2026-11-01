import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const r=JSON.parse(readFileSync('evaluation/sigma-userloss-counterfactual.json','utf8'));
test('user loss five suspect wall decisions have legal counterfactual moves',()=>{
 assert.deepEqual(r.analysis.map(x=>x.ply),[7,9,11,15,27]);
 for(const entry of r.analysis){
  assert.equal(entry.actual.action.type,'wall');
  assert.ok(entry.legalCandidates>0);
  assert.ok(entry.alternatives.every(x=>x.action.type==='move'));
 }
 assert.equal(r.analysis[0].actual.metric.own,5);
 assert.equal(r.analysis[0].alternatives[0].metric.own,4);
});
