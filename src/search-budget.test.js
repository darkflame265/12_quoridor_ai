import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync,existsSync} from 'node:fs';
import {probeExecutable,verifyProbeBuild} from '../evaluation/search-probe-policy.mjs';
import {legal,apply} from './engine.js';
const available=existsSync(probeExecutable);
test('fixed node budget repeats exactly, leaves legal PV, and rejects multicore budgets',{skip:!available},()=>{
 verifyProbeBuild();const state=JSON.parse(readFileSync('reports/book70/report.json')).rows[0].state;
 const input={state,ms:30000,cores:1,maxDepth:40};
 const run=cores=>spawnSync(probeExecutable,[],{input:JSON.stringify({...input,cores}),encoding:'utf8',windowsHide:true,env:{...process.env,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:'2000',QUORIDOR_PROBE_TRACE:'1'}});
 const first=run(1),second=run(1);assert.equal(first.status,0,first.stderr);assert.equal(second.status,0,second.stderr);
 const a=JSON.parse(first.stdout),b=JSON.parse(second.stdout);assert.equal(a.result.nodes,2000);
 const key=r=>[r.depth,r.score,r.nodes,r.pv];assert.deepEqual(key(a.result),key(b.result));assert.deepEqual(a.trace,b.trace);
 let p=state;for(const action of a.result.pv){assert.ok(legal(p,action));p=apply(p,action);}
 assert.notEqual(run(4).status,0);
});
