import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {study,logical} from './preview-independent.mjs';
import {digest} from './native-policy.mjs';
import {verifyPreviewBuild,previewExecutable} from './reply-preview-policy.mjs';
import {verifyRootGuardBuild,rootGuardExecutable} from './root-guard-policy.mjs';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';
export async function loadStudy(folder){
 const bytes=await readFile(path.join(folder,'registration.json')),registration=JSON.parse(bytes),corpusBytes=await readFile(path.join(folder,'corpus.json')),inventoryBytes=await readFile(path.join(folder,'archive-inventory.json'));
 assert.deepEqual(registration.study,study);assert.equal(digest(corpusBytes),registration.corpusSha256);assert.equal(digest(inventoryBytes),registration.inventorySha256);
 await checkFrozen(registration);return {registration,registrationSha256:digest(bytes),corpus:JSON.parse(corpusBytes),inventory:JSON.parse(inventoryBytes)};
}
export async function checkFrozen(r){
 assert.deepEqual(r.identity,verifyPreviewBuild());assert.deepEqual(r.referenceIdentity,verifyRootGuardBuild());assert.equal(r.nativeBinarySha256,digest(await readFile(nativeExecutable)));
 for(const [f,h] of Object.entries(r.sourceHashes))assert.equal(digest((await readFile(f,'utf8')).replaceAll('\r\n','\n')),h,f);
}
export function checkPV(state,result){assert.ok(result.pv?.length);let s=state;for(const a of result.pv){assert.ok(legal(s,a),'Illegal PV');s=apply(s,a);}assert.ok(Number.isFinite(result.elapsedMs));}
export const completed=(r,depth)=>r.depth>=depth||Math.abs(r.score)>=29500;
export function invokePreview(state,mode,{nodes=0,maxDepth=40,ms=30000,cores=1}={}){
 const start=performance.now(),call=spawnSync(previewExecutable,[],{input:JSON.stringify({state,ms,cores,maxDepth}),encoding:'utf8',windowsHide:true,timeout:40000,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_REPLY_PREVIEW:mode,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:String(nodes)}});
 assert.equal(call.status,0,call.stderr||String(call.error));const data=JSON.parse(call.stdout);checkPV(state,data.result);
 if(nodes)assert.ok(data.result.nodes<=nodes&&(data.result.nodes===nodes||Math.abs(data.result.score)>=29500),'Node budget timed out rather than exhausted');
 const w=data.replyWork;assert.ok(w.maxCandidates<=8);assert.equal(w.goalMaps,w.calls*2);assert.equal(w.previewEvaluations,w.eligibleFailLow);assert.ok(w.extraSearches<=w.eligibleFailLow);assert.ok(w.baselineEvaluations<=w.calls);if(mode==='off')assert.equal(w.calls,0);
 return {...data,wallMs:performance.now()-start};
}
export async function invokeNative(state,{reference=false,depth=40,ms=30000,cores=1}={}){
 const start=performance.now(),client=new NativeProcess({...(reference?{executable:rootGuardExecutable,env:{QUORIDOR_ROOT_GUARD_MODE:'full'}}:{}),profile:'candidate'});
 try{await client.health();const result=await client.search(state,{ms,cores,maxDepth:depth});checkPV(state,result);return {result,wallMs:performance.now()-start};}finally{client.close();}
}
export function branchInput(row,c,depth){
 const selected=['off','pressure'].map(role=>row.fixed[depth][role].result.pv[0]);selected.push(row.fixed[depth].reference.result.pv[0]);
 if(depth===4){for(const n of study.budgets)for(const role of ['off','pressure'])selected.push(row.budgets[n][role].result.pv[0]);for(const run of row.timed)selected.push(run.result.pv[0]);}
 return {state:c.state,depth,actions:[...new Set(selected.map(encode))]};
}
export function auditBranches(input){
 const call=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify([input]),encoding:'utf8',windowsHide:true,timeout:120000,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
 if(call.status!==0)return {error:call.stderr||String(call.error)||'Branch audit failed'};return JSON.parse(call.stdout)[0];
}
export function deriveRows(rows,corpus){
 return rows.map((saved,i)=>{
  const c=corpus.cases[i],r=structuredClone(saved);assert.equal(r.id,c.id);r.fixedGaps={};r.budgetGaps={};r.referenceErrors=[];
  r.fixed3Parity=JSON.stringify(logical(r.fixed[3].off.result))===JSON.stringify(logical(r.fixed[3].pressure.result));
  r.integrity=JSON.stringify(logical(r.nativeParity.result))===JSON.stringify(logical(r.fixed[3].off.result))&&['off','pressure'].every(role=>JSON.stringify(logical(r.budgetRepeat[role].result))===JSON.stringify(logical(r.budgets[50000][role].result))&&JSON.stringify(r.budgetRepeat[role].replyWork)===JSON.stringify(r.budgets[50000][role].replyWork));
  for(const depth of [...study.depths,...(r.deepRequired?[5]:[])]){
   const f=r.fixed[depth],ref=r.branches[depth];
   if(!ref?.actions||!['off','pressure','reference'].every(role=>completed(f[role].result,depth))){r.referenceErrors.push({depth,reason:ref?.error??'Incomplete fixed depth'});continue;}
   const best=Math.max(...ref.actions.map(a=>a.score));if(best!==f.reference.result.score){r.referenceErrors.push({depth,reason:'Full root and independent branches disagree'});continue;}
   const gap=v=>{const found=ref.actions.find(a=>a.action===encode(v.pv[0]));assert.ok(found);return best-found.score;};
   r.fixedGaps[depth]=Object.fromEntries(['off','pressure'].map(role=>[role,gap(f[role].result)]));
   if(depth===4){for(const n of study.budgets)r.budgetGaps[n]=Object.fromEntries(['off','pressure'].map(role=>[role,gap(r.budgets[n][role].result)]));for(const v of r.timed)v.gap=gap(v.result);}
  }return r;
 });
}
