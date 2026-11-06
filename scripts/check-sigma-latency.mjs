// Integration regression: actual Python/ONNX workers, no user browser/profile.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {Sigma4Process} from '../server/sigma4-process.mjs';
import {initial,legal} from '../src/engine.js';
const rows=[];
for(const engine of ['sigma2','sigma3','sigma4']){
 const client=engine==='sigma4'?new Sigma4Process():new SigmaProcess({variant:engine});
 try{
  // Cancellation must also work before ensure()/model loading completes.
  const startup=client.search(initial(),{id:'startup-cancel',ms:500}).catch(e=>e.name);
  client.cancel('startup-cancel');assert.equal(await startup,'AbortError');
  await client.health();assert.equal(client.pending.size,0);
  const state=initial();
  for(const ms of [50,500]){
   const start=performance.now(),r=await client.search(state,{id:'budget-'+ms,ms});
   const elapsed=performance.now()-start;
   assert.ok(legal(state,r.pv[0]));assert.ok(r.simulations>=0&&r.simulations<=200);
   // Cooperative deadlines permit a native operation and OS scheduling to finish.
   assert.ok(elapsed<ms+200,`${engine} exceeded budget: ${elapsed}ms`);
   if(ms===50)assert.ok(r.budgetLimited&&r.simulations<200);
   rows.push({engine,kind:'budget',ms,elapsedMs:Math.round(elapsed),simulations:r.simulations});
  }
  // Several fast revisions may never form a FIFO of obsolete searches.
  const aborted=[];
  for(let n=0;n<5;n++){
   const job=client.search(state,{id:'old-'+n,ms:500}).catch(e=>e.name);
   aborted.push(job);await new Promise(r=>setTimeout(r,20));client.cancel('old-'+n);
  }
  const start=performance.now(),result=await client.search(state,{id:'latest',ms:500});
  const elapsed=performance.now()-start;
  assert.ok(legal(state,result.pv[0]));assert.ok(elapsed<700,`${engine} stale queue: ${elapsed}ms`);
  assert.deepEqual(await Promise.all(aborted),Array(5).fill('AbortError'));
  assert.equal(client.pending.size,0);
  rows.push({engine,kind:'after-5-cancels',elapsedMs:Math.round(elapsed),simulations:result.simulations});
 }finally{await client.close();}
}
await mkdir('reports/latency-fix-20261106',{recursive:true});await writeFile('reports/latency-fix-20261106/integration.json',JSON.stringify(rows,null,2));
console.log(JSON.stringify(rows));
