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
 constructor({variant='sigma1'}={}){this.variant=variant;this.profile=variant;this.child=null;this.pending=new Map();this.ready=null;}
 ensure(){
  if(this.child)return this.ready;
  const child=spawn('python',['-u',this.variant==='sigma2'?'scripts/sigma2-baseline-worker.py':'scripts/sigma-inference-worker.py'],{env:{...process.env,SIGMA_MODE:'puct',SIGMA_SIMS:'50',SIGMA_VARIANT:this.variant,SIGMA2_SIMS:'200',SIGMA2_REUSE:'0'},stdio:['pipe','pipe','pipe'],windowsHide:true});
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
 async close(){for(const id of this.pending.keys())this.cancel(id);this.child?.kill();this.child=null;this.ready=null;}
}
