import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {initial,apply,legal} from '../src/engine.js';
import {activeNativeProfile,nativeSourceHash} from '../evaluation/native-policy.mjs';
const fixtures=JSON.parse(await readFile('evaluation/fixtures/goal-safety-regressions.json','utf8'));
const make=(goal,executable=pressureExecutable)=>new NativeProcess({executable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:goal?'on':'off',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off'}});
const report={identity:verifyPressureBuild(),defaultProfile:activeNativeProfile(),sourceHash:nativeSourceHash(),checks:[],runs:[],parity:[]};
const important=fixtures.find(f=>f.id.endsWith('37'));
for(let i=0;i<3;i++){const c=make(true);try{const r=await c.search(important.state,{ms:500,cores:4});assert.ok(legal(important.state,r.pv[0]));assert.notDeepEqual(r.pv[0],important.played);assert.equal(r.goalSafety.goalThreat,true);assert.equal(r.goalSafety.exposure[0],1);assert.ok(r.elapsedMs<650);report.runs.push(r);}finally{c.close();}}
report.checks.push('three fresh 500ms/4-core searches avoid the recorded wall and report goal exposure without claiming a win');
const c=make(true);try{
 const lost=fixtures.find(f=>f.id.endsWith('39')),r=await c.search(lost.state,{ms:500,cores:4});assert.ok(r.score<=-29500);report.checks.push('known losing continuation still produces a search loss warning');
 const job=c.search(important.state,{id:'goal-cancel',ms:5000,cores:4}),rejected=assert.rejects(job,{name:'AbortError'});c.cancel('goal-cancel');await rejected;const next=await c.search(initial(),{ms:100,cores:1});assert.ok(legal(initial(),next.pv[0]));report.checks.push('cancellation discards an old goal search and permits reuse');
}finally{c.close();}
const archived='pressure-engine/target/reserve/release/quoridor-pressure.exe';
if(existsSync(archived))for(const f of [{id:'initial',state:initial()},...fixtures.filter(f=>['35','37','39'].some(n=>f.id.endsWith(n)))]){
 const old=make(false,archived),current=make(false);try{const a=await old.search(f.state,{ms:5000,cores:1,maxDepth:3}),b=await current.search(f.state,{ms:5000,cores:1,maxDepth:3});assert.equal(a.depth,b.depth);assert.equal(a.score,b.score);assert.deepEqual(a.pv,b.pv);report.parity.push({id:f.id,depth:b.depth,score:b.score,pv:b.pv});}finally{old.close();current.close();}
}
report.status='passed';await mkdir('reports/goal-safety04',{recursive:true});await writeFile('reports/goal-safety04/check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,checks:report.checks,parity:report.parity.length}));
