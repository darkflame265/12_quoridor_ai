import test from 'node:test';
import assert from 'node:assert/strict';
import {preferCompletedSearch} from './fixed-result.js';
const result=(depth,x,extra={})=>({depth,pv:[{type:'move',x,y:6}],...extra});
test('fixed search keeps its new complete result when equally deep',()=>{
 assert.equal(preferCompletedSearch(result(4,1),result(4,2)).pv[0].x,1);
});
test('fixed search reuses deeper ponder result and never replaces exact proof',()=>{
 assert.equal(preferCompletedSearch(result(3,1),result(5,2)).pv[0].x,2);
 assert.equal(preferCompletedSearch(result(3,1,{exact:true}),result(5,2)).pv[0].x,1);
});
