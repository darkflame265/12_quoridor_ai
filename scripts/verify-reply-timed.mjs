import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {nativeExecutable} from '../server/native-process.mjs';
import {verifyPreviewBuild} from '../evaluation/reply-preview-policy.mjs';
import {verifyRootGuardBuild,rootGuardExecutable} from '../evaluation/root-guard-policy.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';
const folder=process.argv[2];if(!folder)throw Error('Specify preview report folder');
const bytes=await readFile(path.join(folder,'timed-diagnostic.json')),r=JSON.parse(bytes),sourceBytes=await readFile(path.join(folder,'report.json')),source=JSON.parse(sourceBytes);
assert.equal(r.format,'atlas-reply-time-diagnostic-v1');assert.equal(r.sourceReportSha256,digest(sourceBytes));assert.equal(r.scriptSha256,digest(await readFile('scripts/time-reply-preview.mjs')));
assert.deepEqual(r.identity,verifyPreviewBuild());assert.deepEqual(r.branchIdentity,verifyRootGuardBuild());assert.equal(r.nativeHash,digest(await readFile(nativeExecutable)));
assert.equal(r.status,'diagnostic-only-node-gate-failed');assert.equal(r.ms,500);assert.equal(r.cores,4);assert.equal(r.mode,'pressure');assert.equal(r.rows.length,source.rows.length);
for(let i=0;i<r.rows.length;i++){
 const row=r.rows[i];assert.equal(row.id,source.rows[i].id);assert.deepEqual(row.state,source.rows[i].state);assert.equal(row.runs.length,6);
 for(let round=0;round<3;round++)for(const role of ['original','pressure'])assert.equal(row.runs.filter(v=>v.round===round&&v.role===role).length,1);
 for(const v of row.runs){
  assert.ok(Number.isFinite(v.wallMs)&&v.wallMs>0);assert.ok(Number.isFinite(v.result.elapsedMs)&&v.result.elapsedMs>0);assert.equal(v.result.workers,4);assert.ok(v.result.pv.length>0);
  let p=row.state;for(const a of v.result.pv){assert.ok(legal(p,a));p=apply(p,a);}
  if(v.role==='pressure'){assert.ok(v.work.maxCandidates<=8);assert.equal(v.work.goalMaps,v.work.calls*2);assert.ok(v.work.extraSearches<=v.work.eligibleFailLow);assert.equal(v.work.previewEvaluations,v.work.eligibleFailLow);}else assert.equal(v.work,null);
 }
}
const inputs=r.rows.map(row=>({state:row.state,depth:4,actions:row.reference.actions.map(a=>a.action)}));
const call=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
assert.equal(call.status,0,call.stderr);const refs=JSON.parse(call.stdout);
for(let i=0;i<r.rows.length;i++){
 const row=r.rows[i],ref=refs[i];assert.deepEqual(row.reference.actions.map(a=>[a.action,a.score]),ref.actions.map(a=>[a.action,a.score]));const best=Math.max(...ref.actions.map(a=>a.score));assert.equal(best,source.rows[i].fullScore);
 for(const v of row.runs)assert.equal(v.referenceGap,best-ref.actions.find(a=>a.action===encode(v.result.pv[0])).score);
}
const summary=Object.fromEntries(['original','pressure'].map(role=>{const runs=r.rows.flatMap(row=>row.runs.filter(v=>v.role===role));return [role,{searches:runs.length,completedDepth4:runs.filter(v=>v.result.depth>=4).length,inferiorAtDepth4:runs.filter(v=>v.referenceGap>0).length,averageDepth:runs.reduce((n,v)=>n+v.result.depth,0)/runs.length,averageNodes:runs.reduce((n,v)=>n+v.result.nodes,0)/runs.length,engineOverruns:runs.filter(v=>v.result.elapsedMs>605).length}];}));assert.deepEqual(summary,r.summary);
await writeFile(path.join(folder,'timed-verification.json'),JSON.stringify({reportSha256:digest(bytes),verifierSha256:digest(await readFile('scripts/verify-reply-timed.mjs')),storedSearchesVerified:30,branchSetsRecomputed:refs.length,timingReproduced:false,summary},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
