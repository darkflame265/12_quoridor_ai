import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {activeNativeProfile,nativeSourceHash} from '../evaluation/native-policy.mjs';
import {legal} from '../src/engine.js';
const fixtures=JSON.parse(await readFile('evaluation/fixtures/reserve-regressions.json','utf8'));
const enabled=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on'}});
const disabled=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'off'}});
const report={identity:verifyPressureBuild(),sourceHash:nativeSourceHash(),defaultProfile:activeNativeProfile(),developmentOnly:true,positions:[]};
try{
 for(const f of fixtures){
  const before=structuredClone(f.state),control=await disabled.search(f.state,{ms:3000,cores:1,maxDepth:3}),candidate=await enabled.search(f.state,{ms:3000,cores:1,maxDepth:3});
  assert.deepEqual(f.state,before);assert.ok(legal(f.state,candidate.pv[0]));assert.ok(Math.abs(candidate.score)<29500||f.id.endsWith('51'));
  report.positions.push({id:f.id,protected:f.protected,control,candidate});
 }
 const row=report.positions.find(p=>p.id.endsWith('27'));assert.ok(row.candidate.score<row.control.score,'stock correction must reduce optimism on exposed loss');
 report.status='passed';await mkdir('reports/reserve02',{recursive:true});await writeFile('reports/reserve02/check.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.positions.map(r=>({id:r.id,old:r.control.score,new:r.candidate.score,depth:r.candidate.depth})),null,2));
}finally{enabled.close();disabled.close();}
