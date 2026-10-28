import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {speedExecutable,verifySpeedBuild} from '../evaluation/speed-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';
import {initial,legal} from '../src/engine.js';
const out=process.argv[2];if(!out)throw Error('Specify fresh output JSON');
const identity=verifySpeedBuild(),inputs=[];let states=[initial()];
const archive=JSON.parse(await readFile('reports/native53/validation/report.json'));
for(const g of archive.games.filter(g=>g.result==='loss')){
 const file=path.join('reports/native53/validation',g.file),bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});
 states.push(...reconstructLoss(JSON.parse(bytes),{file,suite:g.suite}).map(p=>p.state));
}
states=states.filter(s=>s.left[0]+s.left[1]>1);const rows=[];
for(let i=0;i<12;i++){
 const state=states[Math.floor(i*states.length/12)],row={index:i,state};
 for(const opt of i%2?[true,false]:[false,true]){
  const client=new NativeProcess({executable:opt?speedExecutable:nativeExecutable,profile:'candidate'});
  try{await client.health();const r=await client.search(state,{ms:30000,cores:1,maxDepth:3});if(!legal(state,r.pv[0]))throw Error('Illegal result');row[opt?'optimized':'original']=r;}finally{client.close();}
 }
 const a=row.original,b=row.optimized;
 if(a.depth!==b.depth||a.depth<3&&Math.abs(a.score)<29000||a.nodes!==b.nodes||a.score!==b.score||JSON.stringify(a.pv)!==JSON.stringify(b.pv))throw Error(`Depth-three parity failed at ${i}`);
 rows.push(row);
}
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({format:'atlas-speed-deep-proof-v1',identity,baselineBinary:digest(await readFile(nativeExecutable)),inputs,scriptSha256:digest(await readFile('scripts/check-speed-deep.mjs')),rows,productionActive:false},null,2)+'\n',{flag:'wx'});
console.log(`Depth-three score, PV and node parity verified for ${rows.length} states`);
