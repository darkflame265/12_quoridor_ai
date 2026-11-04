import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {SigmaProcess} from './sigma-process.mjs';
import {chooseLookaheadSigma4} from '../scripts/sigma4-lookahead-choice.mjs';
import {legal} from '../src/engine.js';

// Isolated Sigma3 model search; Sigma4 adds the bounded tactical policy.
export class Sigma4Process extends SigmaProcess {
 constructor(){
  super({variant:'sigma3'});
  this.profile='sigma4';
 }
 ensure(){
  if(this.child)return this.ready;
  const child=spawn('python',['-u','scripts/sigma-inference-worker.py'],{
   env:{...process.env,SIGMA_MODE:'puct',SIGMA_SIMS:'50',SIGMA_VARIANT:'sigma3',
    SIGMA2_SIMS:'200',SIGMA2_REUSE:'0',SIGMA2_DETERMINISTIC:'1',
    SIGMA_EXPLORATION:'0',SIGMA_DIAGNOSTICS:'1'},
   stdio:['pipe','pipe','pipe'],windowsHide:true
  });
  this.child=child;
  this.ready=new Promise((resolve,reject)=>{
   let settled=false;
   const fail=err=>{
    if(this.child===child){this.child=null;this.ready=null;}
    if(!settled){settled=true;reject(err);}
    for(const job of this.pending.values()){clearTimeout(job.timer);job.reject(err);}
    this.pending.clear();
   };
   child.once('error',fail);
   child.once('exit',code=>fail(Error('Sigma4 base worker exited '+code)));
   readline.createInterface({input:child.stdout}).on('line',line=>{
    let r;try{r=JSON.parse(line);}catch{return;}
    if(r.ready){if(!settled){settled=true;resolve();}return;}
    const job=this.pending.get(r.id);if(!job)return;
    this.pending.delete(r.id);clearTimeout(job.timer);
    if(r.error)job.reject(Error(r.error));else job.resolve(r);
   });
   child.stderr.on('data',chunk=>process.stderr.write('[sigma4] '+chunk.toString()));
  });
  return this.ready;
 }
 async health(){await this.ensure();return {engine:'sigma4',ready:true};}
 async search(state,options={}){
  const base=await super.search(state,options);
  const native=base.pv?.[0];
  if(!native||!legal(state,native))throw Error('Sigma4 base search returned an illegal action');
  // Same position and history yield a stable root sample across repeated analysis.
  const seedText=JSON.stringify([state.p,state.walls,state.left,state.turn,state.historyStates?.length??0]);
  let seed=2166136261;
  for(let i=0;i<seedText.length;i++)seed=Math.imul(seed^seedText.charCodeAt(i),16777619)>>>0;
  const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
  const started=performance.now();
  const policy=chooseLookaheadSigma4(state,base,random);
  if(!legal(state,policy.action))throw Error('Sigma4 tactical policy returned an illegal action');
  const extra=performance.now()-started;
  return {...base,pv:[policy.action],elapsedMs:(base.elapsedMs??0)+extra,
   sigma4:{reason:policy.reason,changed:policy.changed,lookaheadNodes:policy.lookaheadNodes??0,
    baseAction:native,policy:'bounded-3ply-tactical-q-visit'}};
 }
}
