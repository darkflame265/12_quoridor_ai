import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {randomUUID} from 'node:crypto';
import {moves,validWall} from '../src/engine.js';

const allowed=state=>{
 const actions=moves(state);
 if(state.left[state.turn]>0)for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  const a={type:'wall',x,y,o};if(validWall(state,a))actions.push(a);
 }
 return actions.map(a=>JSON.stringify(Object.fromEntries(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)))));
};
export class SigmaProcess {
 constructor({variant='sigma1',simulations=200,profile=false,optimized=false,cached=false,cacheCapacity=null,wallCached=false,hotProfile=false,fastTerminal=false,positionKey=false,bitsetWall=false}={}){this.bitsetWall=bitsetWall;this.positionKey=positionKey;this.fastTerminal=fastTerminal;this.hotProfile=hotProfile;this.wallCached=wallCached;this.cacheCapacity=cacheCapacity;this.profile=profile;this.optimized=optimized;this.cached=cached;if(!Number.isInteger(simulations)||simulations<1||simulations>200)throw Error('invalid offline simulations');this.simulations=simulations;this.variant=variant;this.child=null;this.pending=new Map();this.ready=null;}
 ensure(){
  if(this.child)return this.ready;
  const child=spawn('python',['-u',this.bitsetWall?'scripts/sigma4-bitset-wall-worker.py':this.positionKey?'scripts/sigma4-cache-positionkey-worker.py':this.fastTerminal?'scripts/sigma4-cache-fastterminal-worker.py':this.hotProfile?'scripts/sigma4-cache-cprofile-worker.py':this.wallCached?'scripts/sigma4-cache-wall-worker.py':this.cacheCapacity!==null?'scripts/sigma4-cache-tuned-worker.py':this.cached?'scripts/sigma4-cache-worker.py':this.optimized?'scripts/sigma4-ort-optimized-worker.py':this.profile?'scripts/sigma4-profile-worker.py':this.variant==='sigma2'?'scripts/sigma2-baseline-worker.py':'scripts/sigma-inference-worker.py'],{env:{...process.env,SIGMA_MODE:'puct',SIGMA_SIMS:'50',SIGMA_VARIANT:this.variant,SIGMA2_SIMS:String(this.simulations),SIGMA2_REUSE:'0',...(this.cacheCapacity!==null?{SIGMA_CACHE_MAX:String(this.cacheCapacity)}:{})},stdio:['pipe','pipe','pipe'],windowsHide:true});
  this.child=child;
  this.ready=new Promise((resolve,reject)=>{
   let settled=false;
   const fail=err=>{
    if(this.child===child){this.child=null;this.ready=null;}
    if(!settled){settled=true;reject(err);}
    for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(err);}this.pending.clear();
   };
   child.once('error',fail);child.once('exit',(code)=>fail(Error('Sigma worker exited '+code)));
   readline.createInterface({input:child.stdout}).on('line',line=>{
    let r;try{r=JSON.parse(line);}catch{return;}
    if(r.ready){if(!settled){settled=true;resolve();}return;}
    const job=this.pending.get(r.id);if(!job)return;
    this.pending.delete(r.id);clearTimeout(job.timer);
    if(r.error)job.reject(Error(r.error));else job.resolve(r);
   });
   child.stderr.on('data',chunk=>process.stderr.write('[sigma] '+chunk.toString()));
  });
  return this.ready;
 }
 async health(){await this.ensure();return {engine:this.variant,ready:true};}
 async search(state,{id=randomUUID(),onProgress=()=>{}}={}){
  await this.ensure();
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>{this.pending.delete(id);reject(Error('Sigma search exceeded safety watchdog 30000ms'));},30000);
   this.pending.set(id,{resolve,reject,timer});
   try{this.child.stdin.write(JSON.stringify({id,state,allowed:allowed(state),history:['sigma2','sigma3'].includes(this.variant)?(state.historyStates??[]).map(v=>({state:v})):[]})+'\n');}
   catch(e){clearTimeout(timer);this.pending.delete(id);reject(e);}
  });
 }
 cancel(id){const job=this.pending.get(id);if(job){clearTimeout(job.timer);this.pending.delete(id);job.reject(Object.assign(Error('Cancelled'),{name:'AbortError'}));}}
 async searchWithDeadline(state,{deadlineMs=500}={}){
  if(!Number.isFinite(deadlineMs)||deadlineMs<=0)throw Error('invalid deadline');
  const id=randomUUID();
  let timer;
  const pending=this.search(state,{id});
  const deadline=new Promise((_,reject)=>{
   timer=setTimeout(()=>{
    this.cancel(id);
    const old=this.child;
    this.child=null;this.ready=null;
    if(old)old.kill();
    reject(Object.assign(Error('Sigma research hard deadline exceeded'),{name:'TimeoutError'}));
   },deadlineMs);
  });
  try{return await Promise.race([pending,deadline]);}
  finally{clearTimeout(timer);}
 }
 async close(){for(const id of this.pending.keys())this.cancel(id);this.child?.kill();this.child=null;this.ready=null;}
}
