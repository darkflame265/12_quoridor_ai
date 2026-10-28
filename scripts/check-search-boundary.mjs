import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {probeExecutable,verifyProbeBuild} from '../evaluation/search-probe-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {encode} from '../src/search.js';
const folder=process.argv[2];if(!folder)throw Error('Specify budget report folder');
const bytes=await readFile(path.join(folder,'report.json')),base=JSON.parse(bytes),candidateBytes=await readFile(path.join(folder,'chain-candidate.json')),candidate=JSON.parse(candidateBytes);
assert.deepEqual(verifyProbeBuild(),base.identity);
for(const [f,h] of Object.entries(candidate.identity.sources))assert.equal(digest(await readFile(f)),h);
const exe=`chain-guard-engine/target/release/quoridor-chain-guard${process.platform==='win32'?'.exe':''}`;
assert.equal(digest(await readFile(exe)),candidate.identity.binarySha256);
const rows=[];
for(const r of base.rows){
 const row={id:r.id};for(const [name,file] of [['off',probeExecutable],['chain',exe]]){
  const repeats=[];for(let i=0;i<2;i++){
   const call=spawnSync(file,[],{input:JSON.stringify({state:r.state,ms:30000,cores:1,maxDepth:40}),encoding:'utf8',windowsHide:true,env:{...process.env,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:'50000'}});
   assert.equal(call.status,0,call.stderr);const v=JSON.parse(call.stdout).result;assert.equal(v.nodes,50000);
   const branch=r.reference.actions.find(a=>a.action===encode(v.pv[0]));assert.ok(branch,'New action needs a branch reference');
   repeats.push({depth:v.depth,score:v.score,nodes:v.nodes,pv:v.pv,referenceGap:base.rows.find(s=>s.id===r.id).fixed.full.result.score-branch.score});
  }assert.deepEqual(repeats[0],repeats[1]);row[name]=repeats[0];
 }rows.push(row);
}
const summary={positions:rows.length,nodeBudget:50000,cores:1,exactRepeats:rows.length*2,depthRegressions:rows.filter(r=>r.chain.depth<r.off.depth).length,gapImprovements:rows.filter(r=>r.chain.referenceGap<r.off.referenceGap).length,gapRegressions:rows.filter(r=>r.chain.referenceGap>r.off.referenceGap).length};
const report={sourceReportSha256:digest(bytes),candidateReportSha256:digest(candidateBytes),scriptSha256:digest(await readFile('scripts/check-search-boundary.mjs')),rows,summary};
const file=path.join(folder,'boundary.json');
if(process.argv.includes('--verify')){const saved=await readFile(file);assert.deepEqual(report,JSON.parse(saved));await writeFile(path.join(folder,'boundary-verification.json'),JSON.stringify({reportSha256:digest(saved),recomputedSearches:rows.length*4,summary},null,2)+'\n');}
else await writeFile(file,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
