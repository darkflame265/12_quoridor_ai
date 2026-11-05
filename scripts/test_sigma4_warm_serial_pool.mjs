import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {initial,legal} from '../src/engine.js';
import {SigmaWarmSerialPool} from './sigma4-warm-serial-pool.mjs';
const pool=new SigmaWarmSerialPool({variant:'sigma3',simulations:200,bitsetWall:true});
const state=initial();
let report={version:'sigma4-warm-serial-queue-v1',results:[]};
try{
 const t=performance.now();
 await pool.warm();
 report.startupMs=performance.now()-t;
 const tasks=Array.from({length:3},()=>pool.search(state));
 const results=await Promise.all(tasks);
 for(const [i,r] of results.entries()){
  assert(legal(state,r.response.pv?.[0]));
  assert.equal(r.response.simulations,200);
  assert.equal(r.metrics.id,i+1);
  report.results.push({action:r.response.pv[0],...r.metrics});
 }
 assert.deepEqual(results[0].response.pv,results[1].response.pv);
 assert.deepEqual(results[1].response.pv,results[2].response.pv);
 assert(results[1].metrics.queueWaitMs>results[0].metrics.queueWaitMs);
 assert(results[2].metrics.queueWaitMs>results[1].metrics.queueWaitMs);
 console.log('PASS serial queue, prewarm and exact repeated action',JSON.stringify(report));
}finally{await pool.close();}
writeFileSync('evaluation/sigma4-warm-serial-queue-20261105.json',JSON.stringify(report,null,2)+'\n');
