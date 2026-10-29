import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {loadStudy,checkFrozen,invokePreview,invokeNative,branchInput,auditBranches,deriveRows,completed} from '../evaluation/preview-study-io.mjs';
import {study,assessIndependent} from '../evaluation/preview-independent.mjs';
const folder=process.argv[2];if(!folder)throw Error('Specify registered study folder');const context=await loadStudy(folder),{registration,registrationSha256,corpus}=context,file=path.join(folder,'run.json');let report;
try{report=JSON.parse(await readFile(file));if(!process.argv.includes('--resume'))throw Error('Run already exists; use --resume');assert.equal(report.registrationSha256,registrationSha256);assert.notEqual(report.status,'completed');report.resumes=(report.resumes??0)+1;}catch(e){if(e.code!=='ENOENT')throw e;report={format:'atlas-pressure-independent-v1',registrationSha256,status:'running',startedAt:new Date().toISOString(),resumes:0,rows:corpus.cases.map(c=>({id:c.id,suite:c.suite,familyId:c.familyId,flipped:c.flipped,deepRequired:c.familyIndex===study.deepFamilyIndex,nativeParity:null,fixed:{},budgets:{},budgetRepeat:{},timed:[],branches:{}})),productionChanged:false};}
const save=async()=>writeFile(file,JSON.stringify(report,null,2)+'\n');await save();
try{
 for(let i=0;i<report.rows.length;i++){
  const row=report.rows[i],c=corpus.cases[i];
  if(!row.nativeParity){row.nativeParity=await invokeNative(c.state,{depth:3});await save();}
  for(const depth of [...study.depths,...(row.deepRequired?[5]:[])]){
   row.fixed[depth]??={};for(const role of i%2?['pressure','off']:['off','pressure'])if(!row.fixed[depth][role]){row.fixed[depth][role]=invokePreview(c.state,role,{maxDepth:depth});await save();}
   if(!row.fixed[depth].reference){row.fixed[depth].reference=await invokeNative(c.state,{reference:true,depth});await save();}
  }
  for(const n of study.budgets){row.budgets[n]??={};for(const role of i%2?['pressure','off']:['off','pressure'])if(!row.budgets[n][role]){row.budgets[n][role]=invokePreview(c.state,role,{nodes:n});await save();}}
  for(const role of ['off','pressure'])if(!row.budgetRepeat[role]){row.budgetRepeat[role]=invokePreview(c.state,role,{nodes:50000});await save();}
  console.log(`Fixed/curve ${i+1}/${report.rows.length}: ${row.id}`);
 }
 await checkFrozen(registration);
 // Sequential production-binary time searches only; no heavy checks in parallel.
 for(let round=0;round<study.rounds;round++)for(let offset=0;offset<report.rows.length;offset++){
  const i=(offset+round)%report.rows.length,row=report.rows[i],c=corpus.cases[i];
  for(const role of (offset+round)%2?['pressure','original']:['original','pressure'])if(!row.timed.some(v=>v.round===round&&v.role===role)){
   const data=role==='original'?await invokeNative(c.state,{ms:study.ms,cores:study.cores}):invokePreview(c.state,'pressure',{ms:study.ms,cores:study.cores});
   row.timed.push({round,role,...data});await save();
  }console.log(`Timed round ${round+1}: ${row.id}`);
 }
 for(let i=0;i<report.rows.length;i++){
  const row=report.rows[i],c=corpus.cases[i];
  for(const depth of [...study.depths,...(row.deepRequired?[5]:[])])if(!row.branches[depth]){
   row.branches[depth]=['off','pressure','reference'].every(role=>completed(row.fixed[depth][role].result,depth))?auditBranches(branchInput(row,c,depth)):{error:'Required search did not complete depth'};await save();
  }console.log(`References ${i+1}/${report.rows.length}: ${row.id}`);
 }
 await checkFrozen(registration);report.rows=deriveRows(report.rows,corpus);report.assessment=assessIndependent(report.rows);report.status='completed';report.completedAt=new Date().toISOString();delete report.error;await save();console.log(JSON.stringify(report.assessment,null,2));
}catch(error){report.status='error';report.error=String(error.stack??error);await save();throw error;}
