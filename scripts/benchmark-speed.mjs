import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {verifySpeedBuild,speedExecutable} from '../evaluation/speed-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';
import {initial,legal} from '../src/engine.js';
const out=process.argv[2];if(!out)throw Error('Specify fresh output JSON');
const identity=verifySpeedBuild(),archive=JSON.parse(await readFile('reports/native53/validation/report.json')),inputs=[];let states=[initial()];
for(const g of archive.games.filter(g=>g.result==='loss')){
 const file=path.join('reports/native53/validation',g.file),bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});
 states.push(...reconstructLoss(JSON.parse(bytes),{file,suite:g.suite}).map(p=>p.state));
}
// Exact ending tables have a time budget of their own. Test their correctness
// in the inherited Rust suite; exclude them from deterministic node parity.
states=states.filter(s=>s.left[0]+s.left[1]>1);
const fixed=[],timed=[];
async function search(state,optimized,options){
 const client=new NativeProcess({executable:optimized?speedExecutable:nativeExecutable,profile:'candidate'});
 try{await client.health();const start=performance.now(),r=await client.search(state,options);
  if(!legal(state,r.pv[0]))throw Error('Illegal benchmark action');
  return {...r,wallMs:performance.now()-start};
 }finally{client.close();}
}
for(const [index,state] of states.entries()){
 const row={index};for(const opt of index%2?[true,false]:[false,true])row[opt?'optimized':'original']=await search(state,opt,{ms:10000,cores:1,maxDepth:2});
 const a=row.original,b=row.optimized;
 if(a.depth!==b.depth||a.depth<2&&!a.exact&&Math.abs(a.score)<29000||a.score!==b.score||a.nodes!==b.nodes||JSON.stringify(a.pv)!==JSON.stringify(b.pv))throw Error(`Fixed-depth mismatch at ${index}`);
 fixed.push(row);
}
for(let index=0;index<Math.min(12,states.length);index++){
 const state=states[Math.floor(index*states.length/12)],row={index};
 for(const opt of index%2?[true,false]:[false,true])row[opt?'optimized':'original']=await search(state,opt,{ms:500,cores:4});timed.push(row);
}
const sum=(list,k,f)=>list.reduce((n,r)=>n+r[k][f],0);
const summary={fixedStates:fixed.length,fixedResultsIdentical:true,fixedOriginalMs:sum(fixed,'original','wallMs'),fixedOptimizedMs:sum(fixed,'optimized','wallMs'),timedStates:timed.length,
 timedOriginalNodes:sum(timed,'original','nodes'),timedOptimizedNodes:sum(timed,'optimized','nodes'),timedOriginalDepth:sum(timed,'original','depth')/timed.length,timedOptimizedDepth:sum(timed,'optimized','depth')/timed.length};
const result={format:'atlas-speed-benchmark-v1',identity,baselineBinary:digest(await readFile(nativeExecutable)),scriptSha256:digest(await readFile('scripts/benchmark-speed.mjs')),inputs,summary,fixed,timed,productionActive:false,
 caveat:'Fixed depth uses one core; timed search uses 500ms and four cores. Shared cache hits include multiple cache types, not a transposition-table hit rate.'};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
