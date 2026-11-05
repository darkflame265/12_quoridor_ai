import {performance} from 'node:perf_hooks';
import {SigmaProcess} from './sigma4-budget-process.mjs';

/**
 * Research-only single-worker queue. Avoids concurrently scheduling MCTS
 * searches on the same Python worker. Does not guarantee a wall-clock deadline:
 * queue waits and ongoing 200-simulation searches can exceed 500ms.
 */
export class SigmaWarmSerialPool {
 constructor(options={variant:'sigma3',simulations:200,bitsetWall:true}){
  this.worker=new SigmaProcess(options);
  this.queue=Promise.resolve();
  this.closed=false;
  this.ready=null;
  this.nextJobId=0;
 }
 async warm(){
  if(this.closed)throw Error('pool closed');
  if(!this.ready)this.ready=this.worker.health().catch(err=>{this.ready=null;throw err;});
  return this.ready;
 }
 search(state){
  if(this.closed)return Promise.reject(Error('pool closed'));
  const enqueuedAt=performance.now(),id=++this.nextJobId;
  const execute=async()=>{
   await this.warm();
   const startedAt=performance.now();
   const response=await this.worker.search(state);
   const finishedAt=performance.now();
   return {
    response,
    metrics:{
     id,
     queueWaitMs:startedAt-enqueuedAt,
     searchWallMs:finishedAt-startedAt,
     fullWaitMs:finishedAt-enqueuedAt,
     workerMs:response.elapsedMs
    }
   };
  };
  const result=this.queue.then(execute);
  this.queue=result.then(()=>{},()=>{});
  return result;
 }
 async close(){
  this.closed=true;
  await this.queue;
  await this.worker.close();
 }
}
