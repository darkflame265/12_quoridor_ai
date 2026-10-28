import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {responseExecutable,verifyResponseBuild} from '../evaluation/response-order-policy.mjs';
import {legal,apply} from './engine.js';
test('response order modes keep exact node budgets and legal moves; unknown modes fail',{skip:!existsSync(responseExecutable)},()=>{
 verifyResponseBuild();const state=JSON.parse(readFileSync('reports/book70/report.json')).rows[0].state;
 for(const mode of ['off','routes','static','invalid']){
  const r=spawnSync(responseExecutable,[],{input:JSON.stringify({state,ms:30000,cores:1,maxDepth:40}),encoding:'utf8',windowsHide:true,env:{...process.env,QUORIDOR_RESPONSE_ORDER:mode,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:'2000'}});
  if(mode==='invalid'){assert.notEqual(r.status,0);continue;}
  assert.equal(r.status,0,r.stderr);const result=JSON.parse(r.stdout).result;assert.equal(result.nodes,2000);
  let p=state;for(const a of result.pv){assert.ok(legal(p,a));p=apply(p,a);}
 }
});
