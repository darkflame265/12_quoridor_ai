import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const M=(x,y)=>({type:'move',x,y});
const W=(x,y,o)=>({type:'wall',x,y,o});
const fixtures=[
 {id:'start',actions:[]},
 {id:'pawn-shift',actions:[M(4,7),M(4,1),M(4,6),M(4,2),M(3,6),M(5,2)]},
 {id:'wall-shift',actions:[M(4,7),M(4,1),W(3,4,'h'),M(4,2),M(3,7),M(5,2)]}
];
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1'});
const result={version:'sigma4-budget-benchmark-v1',settings:{sims:[50,100,200],positions:fixtures.map(f=>f.id),runtime:'warm worker after one startup'},results:[]};
for(const simulations of result.settings.sims){
 const worker=new SigmaProcess({variant:'sigma3',simulations});
 try{
  await worker.health();
  for(const f of fixtures){
   let s=initial(),history=[];
   for(const a of f.actions){if(!legal(s,a))throw Error('illegal fixture '+f.id);history.push(clone(s));s=apply(s,a);}
   const begin=performance.now();
   const search=await worker.search({...s,historyStates:history});
   const wallMs=performance.now()-begin;
   if(!legal(s,search.pv?.[0]))throw Error('invalid output');
   const entry={simulations,fixture:f.id,wallMs,engineMs:search.elapsedMs,chosen:search.pv[0],rootVisits:search.diagnostics?.rootChildren?.reduce((sum,c)=>sum+c.visits,0)};
   result.results.push(entry);
   console.log('BENCH',JSON.stringify(entry));
   writeFileSync('evaluation/sigma4-budget-benchmark-20261105.json',JSON.stringify(result,null,2)+'\n');
  }
 }finally{await worker.close();}
}
const bySim=result.settings.sims.map(simulations=>{
 const a=result.results.filter(x=>x.simulations===simulations);
 return {simulations,meanWallMs:a.reduce((s,x)=>s+x.wallMs,0)/a.length,maxWallMs:Math.max(...a.map(x=>x.wallMs)),under500:a.filter(x=>x.wallMs<=500).length,total:a.length};
});
result.summary=bySim;
writeFileSync('evaluation/sigma4-budget-benchmark-20261105.json',JSON.stringify(result,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(bySim));
