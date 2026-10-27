import test from 'node:test';
import assert from 'node:assert/strict';
import {searchFixtures,SEARCH_COHORTS} from '../evaluation/search-fixtures.mjs';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
import {positionKey} from '../evaluation/native-diagnostics.mjs';
import {initial,legal,apply} from './engine.js';
import {readFileSync} from 'node:fs';
test('new search cohorts exclude old exposed layouts and one another',()=>{
 for(const suite of ['general','maze']){
  const used=new Set(['development','validation','holdout'].flatMap(s=>nativeFixtures(s,suite,50,'v3')).map(f=>positionKey(f.state)));
  for(const cohort of Object.keys(SEARCH_COHORTS))for(const split of ['development','validation','holdout']){
   const fixtures=searchFixtures(split,suite,50,cohort);assert.equal(fixtures.length,50);
   for(const f of fixtures){const k=positionKey(f.state);assert(!used.has(k));used.add(k);let s=initial();for(const a of f.records){assert(legal(s,a));s=apply(s,a);}assert.deepEqual(s,f.state);}
  }
 }assert.throws(()=>searchFixtures('unknown','maze',1));
});
test('shorter fixture generation preserves previously evaluated validation prefixes',()=>{
 for(const [cohort,directory] of [['search55-v1','reports/search55/ordering-validation'],['search56-v1','reports/search56/resource-validation'],['search57-v1','reports/geometry57/physical-validation']]){
  const report=JSON.parse(readFileSync(`${directory}/report.json`));
  for(const g of report.games){const game=JSON.parse(readFileSync(`${directory}/${g.file}`)),fixture=searchFixtures('validation',g.suite,g.openingIndex+1,cohort)[g.openingIndex];assert.deepEqual(game.records.slice(0,game.openingPlies),fixture.records);}
 }
});
