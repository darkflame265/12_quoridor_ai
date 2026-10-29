import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {previewExecutable,verifyPreviewBuild} from '../evaluation/reply-preview-policy.mjs';
import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {encode} from '../src/search.js';
const folder=process.argv[2];if(!folder)throw Error('Specify report folder');
const bytes=await readFile(path.join(folder,'report.json')),report=JSON.parse(bytes);
assert.equal(report.format,'atlas-reply-preview-v1');assert.equal(report.productionChanged,false);
assert.deepEqual(report.identity,verifyPreviewBuild());assert.deepEqual(report.branchIdentity,verifyRootGuardBuild());
assert.equal(report.scriptSha256,digest(await readFile('scripts/check-reply-preview.mjs')));
for(const source of report.sources)assert.equal(digest(await readFile(source.file)),source.sha256);
const original=JSON.parse(await readFile(report.sources[0].file)),modes=['gain','pressure'];
const logical=r=>({depth:r.depth,score:r.score,nodes:r.nodes,pv:r.pv});let recomputed=0,fullWidthChecks=0;
for(const [i,row] of report.rows.entries()){
 assert.equal(row.id,original.rows[i].id);assert.deepEqual(row.state,original.rows[i].state);
 assert.deepEqual(logical(row.parity.result),logical(original.rows[i].baseline));
 for(const mode of modes){
  for(const [kind,nodes,maxDepth] of [['fixed',0,4],['budget',50000,40]]){
   const call=spawnSync(previewExecutable,[],{input:JSON.stringify({state:row.state,ms:30000,cores:1,maxDepth}),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_REPLY_PREVIEW:mode,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:String(nodes)}});
   assert.equal(call.status,0,call.stderr);const output=JSON.parse(call.stdout),value=output.result;recomputed++;
   assert.deepEqual(output.replyWork,row.candidate[mode][kind].replyWork);
   assert.ok(output.replyWork.maxCandidates<=8);
   assert.equal(output.replyWork.goalMaps,output.replyWork.calls*2);
   assert.ok(output.replyWork.extraSearches<=output.replyWork.eligibleFailLow);
   assert.equal(output.replyWork.previewEvaluations,output.replyWork.eligibleFailLow);
   assert.ok(output.replyWork.baselineEvaluations<=output.replyWork.calls);
   assert.deepEqual(logical(value),logical(row.candidate[mode][kind].result));
   if(nodes)assert.equal(digest(JSON.stringify(logical(value))),row.candidate[mode].repeatSha256);
  }
  // With all LMR disabled, reordering must preserve the reference score.
  const full=spawnSync(previewExecutable,[],{input:JSON.stringify({state:row.state,ms:30000,cores:1,maxDepth:4}),encoding:'utf8',windowsHide:true,env:{...process.env,QUORIDOR_REPLY_PREVIEW:mode,QUORIDOR_PROBE_MODE:'full',QUORIDOR_PROBE_NODES:'0'}});
  assert.equal(full.status,0,full.stderr);const result=JSON.parse(full.stdout).result;
  assert.equal(result.depth,4);assert.equal(result.score,row.fullScore);fullWidthChecks++;
 }
}
const inputs=report.rows.map(r=>({state:r.state,depth:4,actions:r.reference.actions.map(a=>a.action)}));
const call=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
assert.equal(call.status,0,call.stderr);const refs=JSON.parse(call.stdout);
for(let i=0;i<report.rows.length;i++){
 const r=report.rows[i],ref=refs[i];assert.deepEqual(r.reference.actions.map(a=>[a.action,a.score]),ref.actions.map(a=>[a.action,a.score]));
 const best=Math.max(...ref.actions.map(a=>a.score));assert.equal(best,r.fullScore);
 const gap=v=>best-ref.actions.find(a=>a.action===encode(v.pv[0])).score;
 assert.equal(r.baselineFixedGap,gap(r.baselineFixed));assert.equal(r.baselineBudget.referenceGap,gap(r.baselineBudget));
 for(const mode of modes){assert.equal(r.candidate[mode].fixedGap,gap(r.candidate[mode].fixed.result));assert.equal(r.candidate[mode].budgetGap,gap(r.candidate[mode].budget.result));}
}
const rows=report.rows,summary=Object.fromEntries(modes.map(mode=>{
 const fixedImproved=rows.filter(r=>r.candidate[mode].fixedGap<r.baselineFixedGap).length,fixedWorse=rows.filter(r=>r.candidate[mode].fixedGap>r.baselineFixedGap).length;
 const budgetImproved=rows.filter(r=>r.candidate[mode].budgetGap<r.baselineBudget.referenceGap).length,budgetWorse=rows.filter(r=>r.candidate[mode].budgetGap>r.baselineBudget.referenceGap).length,depthRegressions=rows.filter(r=>r.candidate[mode].budget.result.depth<r.baselineBudget.depth).length;
 return [mode,{fixedImproved,fixedWorse,budgetImproved,budgetWorse,depthRegressions,eligibleForTimedTrial:fixedImproved>0&&fixedWorse===0&&budgetImproved>0&&budgetWorse===0&&depthRegressions===0}];
}));assert.deepEqual(summary,report.summary);
await writeFile(path.join(folder,'verification.json'),JSON.stringify({reportSha256:digest(bytes),verifierSha256:digest(await readFile('scripts/verify-reply-preview.mjs')),recomputedSearches:recomputed,fullWidthScoreChecks:fullWidthChecks,recomputedBranchSets:refs.length,summary},null,2)+'\n');console.log(JSON.stringify(summary,null,2));
