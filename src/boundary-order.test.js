import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {boundaryExecutable,verifyBoundaryBuild} from '../evaluation/boundary-order-policy.mjs';
import {legal,apply} from './engine.js';
test('boundary ordering enforces work caps, legal PV and mode validation',{skip:!existsSync(boundaryExecutable)},()=>{
 verifyBoundaryBuild();const state=JSON.parse(readFileSync('reports/book70/report.json')).rows[0].state;
 for(const mode of ['off','window','promote','invalid']){
  const r=spawnSync(boundaryExecutable,[],{input:JSON.stringify({state,ms:30000,cores:1,maxDepth:40}),encoding:'utf8',windowsHide:true,env:{...process.env,QUORIDOR_BOUNDARY_ORDER:mode,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:'2000'}});
  if(mode==='invalid'){assert.notEqual(r.status,0);continue;}
  assert.equal(r.status,0,r.stderr);const output=JSON.parse(r.stdout);assert.equal(output.result.nodes,2000);
  assert.ok(output.orderingWork.maxPerCall<=(mode==='window'?12:mode==='promote'?17:0));
  let p=state;for(const a of output.result.pv){assert.ok(legal(p,a));p=apply(p,a);}
 }
});
