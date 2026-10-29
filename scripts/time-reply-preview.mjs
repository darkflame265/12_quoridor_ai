import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import assert from 'node:assert/strict';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {activeNativeProfile,digest} from '../evaluation/native-policy.mjs';
import {previewExecutable,verifyPreviewBuild} from '../evaluation/reply-preview-policy.mjs';
import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';
const folder=process.argv[2];if(!folder)throw Error('Specify preview report folder');
const bytes=await readFile(path.join(folder,'report.json')),source=JSON.parse(bytes),identity=verifyPreviewBuild();assert.deepEqual(identity,source.identity);assert.equal(activeNativeProfile(),'candidate');
const nativeHash=digest(await readFile(nativeExecutable)),branchIdentity=verifyRootGuardBuild(),rows=source.rows.map(r=>({id:r.id,state:r.state,runs:[]}));
// This supplements a FAILED node gate. It does not waive it or authorize
// promotion. Measure pressure only, to limit exploratory comparisons.
for(let round=0;round<3;round++)for(let offset=0;offset<rows.length;offset++){
 const row=rows[(offset+round)%rows.length],roles=(offset+round)%2?['pressure','original']:['original','pressure'];
 for(const role of roles){
  const start=performance.now();let result,work=null;
  if(role==='original'){
   const client=new NativeProcess({profile:'candidate'});try{await client.health();result=await client.search(row.state,{ms:500,cores:4});}finally{client.close();}
  }else{
   const call=spawnSync(previewExecutable,[],{input:JSON.stringify({state:row.state,ms:500,cores:4,maxDepth:40}),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_REPLY_PREVIEW:'pressure',QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:'0'}});
   assert.equal(call.status,0,call.stderr);const data=JSON.parse(call.stdout);result=data.result;work=data.replyWork;
  }
  const wallMs=performance.now()-start;let p=row.state;for(const a of result.pv){assert.ok(legal(p,a));p=apply(p,a);}
  row.runs.push({round,role,result,work,wallMs});
 }
 console.log(`${round+1}: ${row.id}`);
}
const inputs=rows.map(r=>({state:r.state,depth:4,actions:[...new Set([...r.runs.map(v=>v.result.pv[0]),source.rows.find(v=>v.id===r.id).fullAction].map(encode))]}));
const audit=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});assert.equal(audit.status,0,audit.stderr);const refs=JSON.parse(audit.stdout);
for(let i=0;i<rows.length;i++){
 const r=rows[i];r.reference=refs[i];const best=Math.max(...r.reference.actions.map(a=>a.score));assert.equal(best,source.rows[i].fullScore);
 for(const run of r.runs)run.referenceGap=best-r.reference.actions.find(a=>a.action===encode(run.result.pv[0])).score;
}
const summary=Object.fromEntries(['original','pressure'].map(role=>{const runs=rows.flatMap(r=>r.runs.filter(v=>v.role===role));return [role,{searches:runs.length,completedDepth4:runs.filter(v=>v.result.depth>=4).length,inferiorAtDepth4:runs.filter(v=>v.referenceGap>0).length,averageDepth:runs.reduce((n,v)=>n+v.result.depth,0)/runs.length,averageNodes:runs.reduce((n,v)=>n+v.result.nodes,0)/runs.length,engineOverruns:runs.filter(v=>v.result.elapsedMs>605).length}];}));
assert.deepEqual(identity,verifyPreviewBuild());assert.deepEqual(branchIdentity,verifyRootGuardBuild());assert.equal(nativeHash,digest(await readFile(nativeExecutable)));
await writeFile(path.join(folder,'timed-diagnostic.json'),JSON.stringify({format:'atlas-reply-time-diagnostic-v1',sourceReportSha256:digest(bytes),scriptSha256:digest(await readFile('scripts/time-reply-preview.mjs')),identity,branchIdentity,nativeHash,ms:500,cores:4,mode:'pressure',status:'diagnostic-only-node-gate-failed',summary,rows,warning:'Exposed cases, three rounds, fresh processes, uncontrolled OS load. Different completed depths can legitimately choose different actions. These old-heuristic depth-four gaps are not game outcomes. Wall time includes different client startup protocols; compare with care. No arena or promotion.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
