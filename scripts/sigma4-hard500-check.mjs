import {writeFileSync} from 'node:fs';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {initial,apply,clone,legal} from '../src/engine.js';
const M=(x,y)=>({type:'move',x,y});
const fixtures=[
 {id:'start',actions:[]},
 {id:'pawn-shift',actions:[M(4,7),M(4,1),M(4,6),M(4,2),M(3,6),M(5,2)]}
];
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const report={version:'sigma4-hard500-research-v1',results:[]};
for(const sims of [100,200]){
 const worker=new SigmaProcess({variant:'sigma3',simulations:sims});
 try{
  await worker.health();
  for(const f of fixtures){
   let state=initial(),history=[];
   for(const a of f.actions){history.push(clone(state));state=apply(state,a);}
   const start=performance.now();
   let result,error;
   try{result=await worker.searchWithDeadline({...state,historyStates:history},{deadlineMs:500});}
   catch(e){error=String(e?.message??e);}
   const wallMs=performance.now()-start;
   if(result&&!legal(state,result.pv?.[0]))throw Error('invalid research move');
   const row={sims,fixture:f.id,success:!!result,wallMs,engineMs:result?.elapsedMs??null,error:error??null};
   report.results.push(row);writeFileSync('evaluation/sigma4-hard500-check-20261105.json',JSON.stringify(report,null,2)+'\n');
   console.log('DEADLINE',JSON.stringify(row));
  }
 }finally{await worker.close();}
}
