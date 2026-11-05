import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {initial,legal} from '../src/engine.js';
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const worker=new SigmaProcess({variant:'sigma3',simulations:200});
const state=initial();
try{
 await worker.health();
 const begin=performance.now();
 let failure;
 try{await worker.searchWithDeadline(state,{deadlineMs:40});}
 catch(e){failure=e;}
 const elapsed=performance.now()-begin;
 assert(failure,'slow worker must be interrupted');
 assert(elapsed<500,'deadline must interrupt promptly');
 assert.equal(worker.child,null,'worker must be terminated after timeout');
 worker.simulations=50;
 const recovered=await worker.searchWithDeadline(state,{deadlineMs:3000});
 assert(legal(state,recovered.pv?.[0]),'worker must restart after interruption');
 console.log('PASS hard worker interruption and restart',{failure:String(failure.message),deadlineElapsedMs:elapsed,recoverySearchMs:recovered.elapsedMs});
}finally{await worker.close();}
