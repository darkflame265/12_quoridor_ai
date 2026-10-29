import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {existsSync,readFileSync} from 'node:fs';
import {replyExecutable,verifyReplyBuild} from '../evaluation/reply-verify-policy.mjs';
import {previewExecutable,verifyPreviewBuild} from '../evaluation/reply-preview-policy.mjs';
import {legal,apply} from './engine.js';
for(const [name,exe,verify,envKey,modes] of [
 ['reply fail-low',replyExecutable,verifyReplyBuild,'QUORIDOR_VERIFY_REPLY',['off','near','all']],
 ['reply preview',previewExecutable,verifyPreviewBuild,'QUORIDOR_REPLY_PREVIEW',['off','gain','pressure']],
])test(`${name} preserves node budget, graph legality and diagnostic counts`,{skip:!existsSync(exe)},()=>{
 verify();const state=JSON.parse(readFileSync('reports/budget71/report.json')).rows[0].state;
 for(const mode of [...modes,'invalid']){
  const call=spawnSync(exe,[],{input:JSON.stringify({state,ms:30000,cores:1,maxDepth:40}),encoding:'utf8',windowsHide:true,env:{...process.env,[envKey]:mode,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:'10000'}});
  if(mode==='invalid'){assert.notEqual(call.status,0);continue;}
  assert.equal(call.status,0,call.stderr);const r=JSON.parse(call.stdout);assert.equal(r.result.nodes,10000);assert.ok(r.replyWork.maxCandidates<=8);assert.equal(r.replyWork.goalMaps,r.replyWork.calls*2);assert.ok(r.replyWork.extraSearches<=r.replyWork.eligibleFailLow);
  if(mode==='off')assert.equal(r.replyWork.calls,0);else assert.ok(r.replyWork.calls>0);
  if(name==='reply preview'){assert.equal(r.replyWork.previewEvaluations,r.replyWork.eligibleFailLow);assert.ok(r.replyWork.baselineEvaluations<=r.replyWork.calls);}
  let p=state;for(const a of r.result.pv){assert.ok(legal(p,a));p=apply(p,a);}
 }
});
