import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {nativeSourceHash,activeNativeProfile} from '../evaluation/native-policy.mjs';
import {tactics,checkTactic} from '../evaluation/suite.js';
import {initial,apply,legal} from '../src/engine.js';
import {pressureMetrics} from '../src/pressure-advice.js';
const out=process.argv[2]??'reports/immediate-pressure/check.json',identity=verifyPressureBuild();assert.equal(activeNativeProfile(),'candidate');
const original=new NativeProcess({profile:'candidate'}),control=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'off'}}),candidate=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on'}});
const screenshot={p:[{x:4,y:5},{x:2,y:2}],turn:0,winner:null,left:[3,6],walls:[{x:1,y:0,o:'h',owner:1},{x:1,y:2,o:'v',owner:0},{x:3,y:2,o:'h',owner:1},{x:5,y:2,o:'h',owner:1},{x:3,y:4,o:'h',owner:1},...[1,3,5,7].map(x=>({x,y:5,o:'h',owner:0})),...[0,2].map(x=>({x,y:6,o:'h',owner:0}))].map(w=>({type:'wall',...w}))};
const report={identity,sourceHash:nativeSourceHash(),defaultProfile:activeNativeProfile(),parity:[],metricChecks:0,tactics:[],snapshots:[],productionPromoted:false};
try{
 await Promise.all([original.health(),control.health(),candidate.health()]);
 const states=[{id:'initial',state:initial()},{id:'provided-board-transcribed',state:screenshot},...tactics().slice(0,4).map(c=>({id:c.id,state:c.state}))];
 for(const {id,state}of states){
  const freshOriginal=new NativeProcess({profile:'candidate'}),freshControl=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'off'}});let a,b;
  try{await Promise.all([freshOriginal.health(),freshControl.health()]);a=await freshOriginal.search(state,{ms:5000,cores:1,maxDepth:3});b=await freshControl.search(state,{ms:5000,cores:1,maxDepth:3});}finally{freshOriginal.close();freshControl.close();}
  assert.equal(b.depth,a.depth,id);assert.equal(b.score,a.score,id);assert.deepEqual(b.pv,a.pv,id);report.parity.push({id,depth:a.depth,score:a.score,pv:a.pv,nodesOriginal:a.nodes,nodesControl:b.nodes});
  const {diagnostics}=await candidate.request({op:'explain',state});assert.ok(!diagnostics.error);
  for(const row of diagnostics.rows){assert.ok(legal(state,row.action));const reference=pressureMetrics(state,row.action);for(const field of ['enemyDelay','ownDelay','placementCost','netGain','firstContact','nearCutEdges','retainedDelay','enemyChoicesBefore','enemyChoicesAfter','bias'])assert.equal(row[field],reference[field],`${id}:${field}:${JSON.stringify(row.action)}`);report.metricChecks++;}
  const stable=await original.search(state,{ms:500,cores:4}),pressure=await candidate.search(state,{ms:500,cores:4});report.snapshots.push({id,state,stable,pressure,alternatives:diagnostics.rows.sort((a,b)=>b.bias-a.bias||b.netGain-a.netGain).slice(0,8)});
 }
 for(const f of tactics()){const r=await candidate.search(f.state,{ms:500,cores:4}),pass=checkTactic(f,r.pv[0]);report.tactics.push({id:f.id,pass,action:r.pv[0]});assert.ok(pass,f.id);}
 // Cancellation must discard the old job and leave a usable process.
 const pending=candidate.search(initial(),{id:'pressure-cancel',ms:3000,cores:4});candidate.cancel('pressure-cancel');await assert.rejects(pending,{name:'AbortError'});const after=await candidate.search(initial(),{ms:100,cores:4});assert.ok(legal(initial(),after.pv[0]));report.cancelAndReuse=true;
 assert.equal(nativeSourceHash(),report.sourceHash);report.status='passed';await mkdir('reports/immediate-pressure',{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,parity:report.parity.length,metricChecks:report.metricChecks,tactics:report.tactics.length,cancelAndReuse:true,sourceHash:report.sourceHash}));
}finally{original.close();control.close();candidate.close();}
