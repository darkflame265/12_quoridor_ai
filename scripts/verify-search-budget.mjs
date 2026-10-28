import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {probeExecutable,verifyProbeBuild} from '../evaluation/search-probe-policy.mjs';
import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {nativeExecutable} from '../server/native-process.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';

const folder=process.argv[2];if(!folder)throw Error('Specify report directory');
const bytes=await readFile(path.join(folder,'report.json')),r=JSON.parse(bytes);
assert.equal(r.format,'atlas-search-budget-v1');assert.equal(r.productionChanged,false);
assert.deepEqual(r.identity,verifyProbeBuild());assert.deepEqual(r.branchIdentity,verifyRootGuardBuild());
assert.equal(r.nativeBinary,digest(await readFile(nativeExecutable)));
const sourceBytes=await readFile(r.source.file);assert.equal(digest(sourceBytes),r.source.sha256);const source=JSON.parse(sourceBytes);
for(const [f,h] of Object.entries(r.hashes))assert.equal(digest((await readFile(f,'utf8')).replaceAll('\r\n','\n')),h,f);
const logical=v=>({depth:v.depth,score:v.score,nodes:v.nodes,pv:v.pv});
const deterministic=v=>({result:logical(v.result),iterations:v.iterations.map(logical),trace:v.trace});
const modes=['off','root','internal','full'];let searches=0;
for(const row of r.rows){
 assert.deepEqual(row.state,source.rows.find(v=>v.id===row.id).state);
 assert.deepEqual(logical(row.baseline),logical(row.parity.result));
 for(const mode of modes)for(const budget of [false,true]){
  const saved=budget?row.budget[mode].first:row.fixed[mode],nodes=budget?20000:0;
  const call=spawnSync(probeExecutable,[],{input:JSON.stringify({state:row.state,ms:30000,cores:1,maxDepth:budget?40:4}),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_PROBE_MODE:mode,QUORIDOR_PROBE_NODES:String(nodes),QUORIDOR_PROBE_TRACE:'1'}});
  assert.equal(call.status,0,call.stderr);const recomputed=JSON.parse(call.stdout);searches++;
  assert.deepEqual(deterministic(recomputed),deterministic(saved),`${row.id}/${mode}/${budget}`);
  if(budget){assert.equal(saved.result.nodes,20000);assert.equal(row.budget[mode].exactRepeat,true);assert.equal(digest(JSON.stringify(deterministic(recomputed))),row.budget[mode].repeatLogicalSha256);}
  else assert.equal(saved.result.depth,4);
  let state=row.state;for(const a of saved.result.pv){assert.ok(legal(state,a));state=apply(state,a);}
 }
 assert.equal(row.timed.length,3);
 for(const t of row.timed){let p=row.state;for(const a of t.pv){assert.ok(legal(p,a));p=apply(p,a);}}
}
const inputs=r.rows.map(row=>({state:row.state,depth:4,actions:row.reference.actions.map(a=>a.action)}));
const audit=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
assert.equal(audit.status,0,audit.stderr);const refs=JSON.parse(audit.stdout);
for(let i=0;i<r.rows.length;i++){
 const row=r.rows[i],ref=refs[i];assert.deepEqual(ref.actions.map(a=>[a.action,a.score]),row.reference.actions.map(a=>[a.action,a.score]));
 const best=Math.max(...ref.actions.map(a=>a.score));assert.equal(best,row.fixed.full.result.score);
 const gap=v=>best-ref.actions.find(a=>a.action===encode(v.pv[0])).score;
 assert.deepEqual(row.fixedGaps,Object.fromEntries(modes.map(m=>[m,gap(row.fixed[m].result)])));
 assert.deepEqual(row.budgetGaps,Object.fromEntries(modes.map(m=>[m,gap(row.budget[m].first.result)])));
 assert.deepEqual(row.timedGaps,row.timed.map(gap));
}
const rows=r.rows,summary={positions:rows.length,parityChecks:rows.length,exactNodeBudgetRepeats:rows.length*4,nodeBudget:20000,nodeBudgetCores:1,timedSearches:rows.length*3,timedActionVaries:rows.filter(row=>new Set(row.timed.map(v=>encode(v.pv[0]))).size>1).length,timedDepthVaries:rows.filter(row=>new Set(row.timed.map(v=>v.depth)).size>1).length,modes:Object.fromEntries(modes.map(m=>[m,{fixedDepthInferior:rows.filter(row=>row.fixedGaps[m]>0).length,budgetInferiorAtDepth4:rows.filter(row=>row.budgetGaps[m]>0).length,budgetDepths:rows.map(row=>row.budget[m].first.result.depth)}]))};
assert.deepEqual(r.summary,summary);
await writeFile(path.join(folder,'verification.json'),JSON.stringify({reportSha256:digest(bytes),verifierSha256:digest(await readFile('scripts/verify-search-budget.mjs')),recomputedSearches:searches,recomputedBranchSets:rows.length,summary},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
