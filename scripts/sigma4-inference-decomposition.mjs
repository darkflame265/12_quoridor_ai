import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,clone,apply,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const fixtures=JSON.parse(readFileSync('evaluation/sigma4-cache100-independent-paired-20261105.json'));
const selected=fixtures.games.filter(g=>g.opponent==='sigma2'&&g.variant==='original200').slice(0,2);
const positions=[];
for(let gi=0;gi<selected.length;gi++){
 let s=initial(),history=[];
 for(let p=0;p<selected[gi].actions.length;p++){
  if([8,14,20,26,32,38].includes(p))
   positions.push({id:gi+'-'+p,s:{...clone(s),historyStates:history.slice(-48)}});
  const a=selected[gi].actions[p];if(!legal(s,a))throw Error('invalid stored match');
  history.push(clone(s));s=apply(s,a);
 }
}
const workers={timed:new SigmaProcess({variant:'sigma3',simulations:200,timingProfile:true}),reference:new SigmaProcess({variant:'sigma3',simulations:200,bitsetStateKey:true})};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1'});
const result={version:'sigma4-inference-decomposition-20261105-v1',results:[]};
const stats=arr=>{const a=[...arr].sort((x,y)=>x-y);return {n:a.length,mean:a.reduce((x,y)=>x+y,0)/a.length,p50:a[Math.ceil(a.length*.5)-1],p95:a[Math.ceil(a.length*.95)-1],p99:a[Math.ceil(a.length*.99)-1],max:a.at(-1)};};
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(const mode of ['serial','concurrent']){
  for(const [i,p] of positions.entries()){
   let p1,p2,t0=performance.now();
   if(mode==='serial'){p1=await workers.timed.search(p.s);p2=await workers.reference.search(p.s);}
   else [p1,p2]=await Promise.all([workers.timed.search(p.s),workers.reference.search(p.s)]);
   const totalWallMs=performance.now()-t0;
   assert.deepEqual(p1.pv,p2.pv,'PV mismatch '+p.id);
   assert.equal(p1.value,p2.value);
   assert.deepEqual(p1.diagnostics?.rootChildren,p2.diagnostics?.rootChildren);
   assert.equal(p1.inferenceCache.tensorBuilds,p1.inferenceCache.misses);
   const row={mode,id:p.id,totalWallMs,profiledWorkerMs:p1.elapsedMs,referenceWorkerMs:p2.elapsedMs,breakdown:p1.timingBreakdown,cache:p1.inferenceCache};
   result.results.push(row);
   console.log('PROFILE',mode,i+1,'/',positions.length,p.id,'engine',Math.round(p1.elapsedMs),'onnx',Math.round(p1.timingBreakdown.onnxMs),'other',Math.round(p1.timingBreakdown.pythonOtherMs),'misses',p1.inferenceCache.misses);
   writeFileSync('evaluation/sigma4-inference-decomposition-20261105.json',JSON.stringify(result,null,2)+'\n');
  }
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()));}
result.summary={};
for(const mode of ['serial','concurrent']){
 const a=result.results.filter(x=>x.mode===mode);
 result.summary[mode]={engineMs:stats(a.map(x=>x.profiledWorkerMs)),referenceMs:stats(a.map(x=>x.referenceWorkerMs)),onnxMs:stats(a.map(x=>x.breakdown.onnxMs)),tensorMs:stats(a.map(x=>x.breakdown.tensorMs)),pythonOtherMs:stats(a.map(x=>x.breakdown.pythonOtherMs)),misses:stats(a.map(x=>x.cache.misses))};
}
writeFileSync('evaluation/sigma4-inference-decomposition-20261105.json',JSON.stringify(result,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(result.summary));
