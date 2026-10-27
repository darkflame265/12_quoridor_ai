import {Position,decode,encode} from './search.js';
export class EnginePool{
 constructor({workers=2,engine='atlas4',workerFactory=()=>new Worker(new URL('./ai-worker.js',import.meta.url),{type:'module'})}={}){if(!['atlas4','atlas3'].includes(engine))throw Error('Unknown engine');this.engine=engine;this.size=engine==='atlas3'?1:Math.max(1,Math.min(4,workers|0));this.factory=workerFactory;this.slots=[];this.serial=0;this.job=null;}
 get active(){return this.job!==null;}
 cancel(error=Object.assign(Error('Calculation cancelled'),{name:'AbortError'})){if(!this.job)return;const job=this.job;this.job=null;this.serial++;for(const w of this.slots)w?.terminate();this.slots=[];job.reject(error);}
 dispose(){this.cancel();for(const w of this.slots)w?.terminate();this.slots=[];}
 search(state,{ms=2000,onProgress=()=>{},ponder=false}={}){
  this.cancel();const id=++this.serial,start=performance.now(),legal=new Position(state).actions();
  if(!legal.length)return Promise.resolve({pv:[],depth:0,nodes:0,elapsedMs:0});
  const size=!state.left[0]&&!state.left[1]?1:this.size,active=Array.from({length:size},(_,i)=>i).filter(i=>legal.some(a=>a%size===i));
  return new Promise((resolve,reject)=>{const job={id,resolve,reject,depths:new Map(),done:new Map(),best:null,ponder};this.job=job;
   const aggregate=results=>{const list=[...results.values()],best=list.slice().sort((a,b)=>b.score-a.score||encode(a.pv[0])-encode(b.pv[0]))[0];return {...best,nodes:list.reduce((n,r)=>n+r.nodes,0),elapsedMs:performance.now()-start,workers:active.length,engine:best.exact?best.engine:`${best.engine} ×${active.length}`};};
   for(const i of active){let worker=this.slots[i];if(!worker){worker=this.factory(i);this.slots[i]=worker;}
    worker.onmessage=({data:r})=>{if(this.job!==job||r.id!==id)return;if(r.error){this.cancel(Error(r.error));return;}
     if(r.pv?.length){const depth=r.exact?0:r.depth;let bucket=job.depths.get(depth);if(!bucket){bucket=new Map();job.depths.set(depth,bucket);}bucket.set(i,r);if(bucket.size===active.length&&(!job.best||depth>=job.best.depth)){job.best=aggregate(bucket);onProgress(job.best);}}
     if(r.done){job.done.set(i,r);if(job.done.size===active.length){this.job=null;const fallback=decode(legal.find(a=>a<81)??legal[0]);resolve(job.best??{pv:[fallback],score:0,depth:0,nodes:[...job.done.values()].reduce((n,r)=>n+r.nodes,0),elapsedMs:performance.now()-start,workers:active.length,engine:`${r.engine??this.engine} · budget fallback`});}}
    };
    worker.onerror=e=>{if(this.job!==job)return;this.cancel(Error(e.message||'Worker failed'));};worker.postMessage({state,ms,id,offset:i,stride:size,engine:this.engine});
   }
  });
 }
}
