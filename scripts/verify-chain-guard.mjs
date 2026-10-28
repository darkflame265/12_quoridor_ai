import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {encode} from '../src/search.js';
const folder=process.argv[2];if(!folder)throw Error('Specify budget report folder');
const bytes=await readFile(path.join(folder,'chain-candidate.json')),r=JSON.parse(bytes),sourceBytes=await readFile(path.join(folder,'report.json')),source=JSON.parse(sourceBytes);
assert.equal(r.sourceReportSha256,digest(sourceBytes));assert.equal(r.productionChanged,false);
for(const [f,h] of Object.entries(r.identity.sources))assert.equal(digest(await readFile(f)),h,f);
const exe=`chain-guard-engine/target/release/quoridor-chain-guard${process.platform==='win32'?'.exe':''}`;
assert.equal(digest(await readFile(exe)),r.identity.binarySha256);
for(let i=0;i<r.rows.length;i++){
 const row=r.rows[i],s=source.rows[i];assert.equal(row.id,s.id);
 for(const [kind,nodes,maxDepth] of [['fixed',0,4],['budget',20000,40]]){
  const run=spawnSync(exe,[],{input:JSON.stringify({state:s.state,ms:30000,cores:1,maxDepth}),encoding:'utf8',windowsHide:true,env:{...process.env,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:String(nodes)}});
  assert.equal(run.status,0,run.stderr);const value=JSON.parse(run.stdout).result;
  for(const key of ['score','depth','nodes','pv'])assert.deepEqual(value[key],row[kind][key]);
  const branch=s.reference.actions.find(a=>a.action===encode(value.pv[0]));assert.ok(branch);
  assert.equal(row[kind].referenceGap,s.fixed.full.result.score-branch.score);
 }
 assert.equal(row.baselineFixedGap,s.fixedGaps.off);assert.equal(row.baselineBudgetGap,s.budgetGaps.off);
 assert.deepEqual(row.baselineBudget,s.budget.off.first.result);
}
const checks={fixedImprovement:r.rows.some(v=>v.fixed.referenceGap<v.baselineFixedGap),budgetImprovement:r.rows.some(v=>v.budget.referenceGap<v.baselineBudgetGap),budgetNoRegression:r.rows.every(v=>v.budget.referenceGap<=v.baselineBudgetGap&&v.budget.depth>=v.baselineBudget.depth)};
assert.deepEqual(checks,r.checks);assert.equal(r.eligibleForArena,Object.values(checks).every(Boolean));
await writeFile(path.join(folder,'chain-verification.json'),JSON.stringify({reportSha256:digest(bytes),verifierSha256:digest(await readFile('scripts/verify-chain-guard.mjs')),recomputedSearches:r.rows.length*2,checks},null,2)+'\n');console.log(JSON.stringify(checks));
