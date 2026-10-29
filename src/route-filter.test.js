import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {filterExecutable,verifyFilterBuild} from '../evaluation/route-filter-policy.mjs';
import {legal,apply} from './engine.js';
test('route filter preserves legal PV, budget and bounded extra work',{skip:!existsSync(filterExecutable)},()=>{
 verifyFilterBuild();const state=JSON.parse(readFileSync('reports/book70/report.json')).rows[0].state;
 for(const mode of ['off','exit','dag','invalid']){
  const call=spawnSync(filterExecutable,[],{input:JSON.stringify({state,ms:30000,cores:1,maxDepth:40}),encoding:'utf8',windowsHide:true,env:{...process.env,QUORIDOR_ROUTE_FILTER:mode,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:'2000'}});
  if(mode==='invalid'){assert.notEqual(call.status,0);continue;}
  assert.equal(call.status,0,call.stderr);const r=JSON.parse(call.stdout);assert.equal(r.result.nodes,2000);
  assert.ok(r.orderingWork.maxPerCall<=(mode==='off'?0:12));assert.equal(r.orderingWork.goalMaps,r.orderingWork.calls*2);
  let p=state;for(const a of r.result.pv){assert.ok(legal(p,a));p=apply(p,a);}
 }
});
