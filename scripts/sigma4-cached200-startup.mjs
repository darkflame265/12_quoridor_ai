import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {initial,legal} from '../src/engine.js';
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const samples=[],state=initial();
for(const mode of ['cold','warm']){
 for(let i=0;i<3;i++){
  const w=new SigmaProcess({variant:'sigma3',simulations:200,cached:true});
  try{
   const healthStart=performance.now();
   if(mode==='warm')await w.health();
   const t=performance.now();
   const result=await w.search(state);
   const elapsed=performance.now()-t;
   if(!legal(state,result.pv[0]))throw Error('illegal');
   samples.push({mode,i,wallMs:elapsed,workerMs:result.elapsedMs,healthMs:mode==='warm'?t-healthStart:null,cache:result.inferenceCache});
   console.log('STARTUP',JSON.stringify(samples.at(-1)));
  }finally{await w.close();}
 }
}
const output={version:'sigma4-cached200-startup-latency-v1',results:samples};
writeFileSync('evaluation/sigma4-cached200-startup-20261105.json',JSON.stringify(output,null,2)+'\n');
