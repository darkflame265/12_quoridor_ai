import test from 'node:test';
import assert from 'node:assert/strict';
import {searchFixtures} from '../evaluation/search-fixtures.mjs';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
import {positionKey} from '../evaluation/native-diagnostics.mjs';
import {initial,legal,apply} from './engine.js';
test('new search cohorts exclude old exposed layouts and one another',()=>{
 for(const suite of ['general','maze']){
  const used=new Set(['development','validation','holdout'].flatMap(s=>nativeFixtures(s,suite,50,'v3')).map(f=>positionKey(f.state)));
  for(const cohort of ['search55-v1','search56-v1'])for(const split of ['development','validation','holdout']){
   const fixtures=searchFixtures(split,suite,50,cohort);assert.equal(fixtures.length,50);
   for(const f of fixtures){const k=positionKey(f.state);assert(!used.has(k));used.add(k);let s=initial();for(const a of f.records){assert(legal(s,a));s=apply(s,a);}assert.deepEqual(s,f.state);}
  }
 }assert.throws(()=>searchFixtures('unknown','maze',1));
});
