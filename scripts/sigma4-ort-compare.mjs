import {writeFileSync} from 'node:fs';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const M=(x,y)=>({type:'move',x,y}),W=(x,y,o)=>({type:'wall',x,y,o});
const setups=[
 {id:'start',actions:[]},
 {id:'pawn-flank',actions:[M(4,7),M(4,1),M(4,6),M(4,2),M(3,6),M(5,2)]},
 {id:'wall-flank',actions:[M(4,7),M(4,1),W(3,4,'h'),M(4,2),M(3,7),M(5,2)]},
 {id:'unseen',actions:[M(4,7),M(4,1),W(4,5,'h'),M(3,1),M(5,7),M(3,2)]}
];
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const out={version:'sigma4-ort-one-thread-comparison-v1',simulations:100,results:[]};
const workers={original:new SigmaProcess({variant:'sigma3',simulations:100}),optimized:new SigmaProcess({variant:'sigma3',simulations:100,optimized:true})};
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(const f of setups){
  let s=initial(),history=[];
  for(const a of f.actions){if(!legal(s,a))throw Error('bad fixture '+f.id);history.push(clone(s));s=apply(s,a)}
  for(const type of ['original','optimized','optimized','original']){
   const start=performance.now();
   const r=await workers[type].search({...s,historyStates:history});
   const elapsed=performance.now()-start;
   if(!legal(s,r.pv?.[0]))throw Error('illegal '+type);
   out.results.push({fixture:f.id,type,wallMs:elapsed,engineMs:r.elapsedMs,action:r.pv[0],value:r.value,rootChildren:r.diagnostics?.rootChildren?.slice(0,4)});
  }
  const matched=out.results.filter(r=>r.fixture===f.id);
  console.log('POSITION',f.id,JSON.stringify(matched.map(x=>({type:x.type,ms:Math.round(x.wallMs),action:x.action}))));
  writeFileSync('evaluation/sigma4-ort-compare-20261105.json',JSON.stringify(out,null,2)+'\n');
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()))}
const avg=type=>out.results.filter(x=>x.type===type).reduce((n,x)=>n+x.wallMs,0)/out.results.filter(x=>x.type===type).length;
out.summary={originalMeanMs:avg('original'),optimizedMeanMs:avg('optimized')};
writeFileSync('evaluation/sigma4-ort-compare-20261105.json',JSON.stringify(out,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(out.summary));
