import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {loadStudy,checkPV,invokePreview,auditBranches,branchInput,deriveRows} from '../evaluation/preview-study-io.mjs';
import {study,archiveGeometries,independentCases,geometryKey,logical,assessIndependent} from '../evaluation/preview-independent.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {replayRecords,positionKey} from '../src/spectator.js';
const folder=process.argv[2];if(!folder)throw Error('Specify completed study folder');
const {registrationSha256,corpus,inventory}=await loadStudy(folder),bytes=await readFile(path.join(folder,'run.json')),report=JSON.parse(bytes);assert.equal(report.status,'completed');assert.equal(report.registrationSha256,registrationSha256);assert.equal(report.productionChanged,false);
const excluded=new Set();for(const source of inventory.files){const text=(await readFile(source.file,'utf8')).replaceAll('\r\n','\n');assert.equal(digest(text),source.sha256,source.file);archiveGeometries(JSON.parse(text),excluded);}
assert.equal(digest([...excluded].sort().join('\n')),corpus.exclusion.sha256);assert.deepEqual(independentCases(excluded),corpus.cases);
const ownership=s=>s.walls.map(w=>`${w.o}:${w.x}:${w.y}:${w.owner}`).sort();
let recomputedBudgets=0,recomputedReferences=0,checkedPVs=0;
assert.equal(report.rows.length,corpus.cases.length);
for(let i=0;i<corpus.cases.length;i++){
 const c=corpus.cases[i],r=report.rows[i];assert.equal(r.id,c.id);assert.equal(r.suite,c.suite);assert.equal(r.familyId,c.familyId);assert.equal(r.flipped,c.flipped);assert.equal(r.deepRequired,c.familyIndex===study.deepFamilyIndex);assert.ok(!excluded.has(geometryKey(c.state)));
 const replayBytes=await readFile(path.join(folder,'replays',`${c.id}.json`)),replay=JSON.parse(replayBytes),rebuilt=replayRecords(replay).state;
 assert.deepEqual(replay.records,c.records);assert.equal(positionKey(rebuilt),positionKey(c.state));assert.deepEqual(ownership(rebuilt),ownership(c.state));
 for(const side of [0,1])assert.equal(c.state.left[side]+c.state.walls.filter(w=>w.owner===side).length,10);
 for(const depth of [...study.depths,...(r.deepRequired?[5]:[])])for(const role of ['off','pressure','reference']){checkPV(c.state,r.fixed[depth][role].result);checkedPVs++;}
 for(const n of study.budgets)for(const role of ['off','pressure']){const v=r.budgets[n][role];checkPV(c.state,v.result);assert.ok(v.result.nodes===n||Math.abs(v.result.score)>=29500);assert.ok(v.replyWork.maxCandidates<=8);assert.equal(v.replyWork.goalMaps,v.replyWork.calls*2);checkedPVs++;}
 for(const role of ['off','pressure']){
  const again=invokePreview(c.state,role,{nodes:50000});assert.deepEqual(logical(again.result),logical(r.budgets[50000][role].result));assert.deepEqual(again.replyWork,r.budgets[50000][role].replyWork);recomputedBudgets++;
 }
 assert.equal(r.timed.length,study.rounds*2);for(let round=0;round<study.rounds;round++)for(const role of ['original','pressure'])assert.equal(r.timed.filter(v=>v.round===round&&v.role===role).length,1);
 for(const run of r.timed){checkPV(c.state,run.result);assert.equal(run.result.workers,4);checkedPVs++;if(run.role==='pressure'){assert.ok(run.replyWork.maxCandidates<=8);assert.equal(run.replyWork.goalMaps,run.replyWork.calls*2);}}
 for(const depth of [...study.depths,...(r.deepRequired?[5]:[])]){
  const old=r.branches[depth];if(old.actions){const again=auditBranches(branchInput(r,c,depth));assert.ok(again.actions,again.error);assert.deepEqual(again.actions.map(a=>[a.action,a.score]),old.actions.map(a=>[a.action,a.score]));recomputedReferences++;}else assert.ok(old.error);
 }
 console.log(`Verified ${i+1}/${corpus.cases.length}: ${c.id}`);
}
const derived=deriveRows(report.rows,corpus);assert.deepEqual(derived,report.rows);assert.deepEqual(assessIndependent(derived),report.assessment);
await writeFile(path.join(folder,'verification.json'),JSON.stringify({registrationSha256,runSha256:digest(bytes),corpusSha256:digest(await readFile(path.join(folder,'corpus.json'))),archiveFilesVerified:inventory.files.length,fixturesRecreated:corpus.cases.length,replaysValidated:corpus.cases.length,checkedPVs,recomputedBudgetRuns:recomputedBudgets,recomputedBranchInputs:recomputedReferences,timingReproduced:false,assessment:report.assessment},null,2)+'\n');console.log(JSON.stringify(report.assessment,null,2));
