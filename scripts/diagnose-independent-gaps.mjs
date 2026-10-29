import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {loadStudy,auditBranches,checkPV,completed} from '../evaluation/preview-study-io.mjs';
import {logical} from '../evaluation/preview-independent.mjs';
import {probeExecutable,verifyProbeBuild} from '../evaluation/search-probe-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {encode} from '../src/search.js';
const folder=process.argv[2];if(!folder)throw Error('Specify completed independent study');const context=await loadStudy(folder),bytes=await readFile(path.join(folder,'run.json')),source=JSON.parse(bytes);assert.equal(source.status,'completed');
const identity=verifyProbeBuild(),targets=[];
for(const suite of ['general','maze']){
 const cases=source.rows.flatMap((r,i)=>r.suite===suite?[3,4].filter(d=>r.fixedGaps[d]?.off>0).map(depth=>({caseIndex:i,depth,gap:r.fixedGaps[depth].off})):[]).sort((a,b)=>b.gap-a.gap||a.caseIndex-b.caseIndex||a.depth-b.depth);
 if(cases.length)targets.push(cases[0]);
}
const rows=[];
for(const target of targets){
 const c=context.corpus.cases[target.caseIndex],original=source.rows[target.caseIndex],searches={};
 for(const mode of ['off','root','internal','full']){
  const env={...process.env,QUORIDOR_PROBE_MODE:mode,QUORIDOR_PROBE_NODES:'0'};delete env.QUORIDOR_PROBE_TRACE;
  const call=spawnSync(probeExecutable,[],{input:JSON.stringify({state:c.state,ms:30000,cores:1,maxDepth:target.depth}),encoding:'utf8',windowsHide:true,timeout:40000,maxBuffer:8*1024*1024,env});assert.equal(call.status,0,call.stderr);const result=JSON.parse(call.stdout).result;assert.ok(completed(result,target.depth));checkPV(c.state,result);searches[mode]=result;
 }
 assert.deepEqual(logical(searches.off),logical(original.fixed[target.depth].off.result));assert.equal(searches.full.score,original.fixed[target.depth].reference.result.score);
 const input={state:c.state,depth:target.depth,actions:[...new Set([...Object.values(searches).map(v=>v.pv[0]),original.fixed[target.depth].reference.result.pv[0]].map(encode))]};
 const reference=auditBranches(input);assert.ok(reference.actions,reference.error);const best=Math.max(...reference.actions.map(a=>a.score));assert.equal(best,searches.full.score);
 const gaps=Object.fromEntries(Object.entries(searches).map(([mode,r])=>[mode,best-reference.actions.find(a=>a.action===encode(r.pv[0])).score]));
 rows.push({id:c.id,suite:c.suite,depth:target.depth,searches,reference,gaps});
}
assert.deepEqual(identity,verifyProbeBuild());const result={registrationSha256:context.registrationSha256,sourceRunSha256:digest(bytes),probeIdentity:identity,scriptSha256:digest(await readFile('scripts/diagnose-independent-gaps.mjs')),selection:'Post-study exploration: largest positive original fixed-depth gap per suite at depths 3/4; deterministic tie order.',rows,warning:'Not preregistered, not used to alter the research gate. Scores use the old heuristic and do not prove game outcomes.'};
const file=path.join(folder,'follow-up.json');
if(process.argv.includes('--verify')){
 const saved=await readFile(file),old=JSON.parse(saved);assert.equal(old.sourceRunSha256,result.sourceRunSha256);assert.deepEqual(old.probeIdentity,result.probeIdentity);assert.equal(old.scriptSha256,result.scriptSha256);
 assert.deepEqual(old.rows.map(r=>({id:r.id,depth:r.depth,gaps:r.gaps,searches:Object.fromEntries(Object.entries(r.searches).map(([k,v])=>[k,logical(v)])),reference:r.reference.actions.map(a=>[a.action,a.score])})),rows.map(r=>({id:r.id,depth:r.depth,gaps:r.gaps,searches:Object.fromEntries(Object.entries(r.searches).map(([k,v])=>[k,logical(v)])),reference:r.reference.actions.map(a=>[a.action,a.score])})));
 await writeFile(path.join(folder,'follow-up-verification.json'),JSON.stringify({reportSha256:digest(saved),recomputedSearches:rows.length*4,recomputedBranchInputs:rows.length},null,2)+'\n');
}else await writeFile(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(rows.map(r=>({id:r.id,depth:r.depth,gaps:r.gaps})),null,2));
