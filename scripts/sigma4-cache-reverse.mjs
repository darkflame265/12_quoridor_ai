import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const d=JSON.parse(readFileSync('evaluation/sigma4-budget-unseen100-vs-200-20261105.json'));
if(!d.games?.length)throw Error('need a completed benchmark match');
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const states=[],actions=d.games[0].actions,s0=initial(),history=[];
let s=s0;
for(let i=0;i<Math.min(30,actions.length);i++){
 if(i>=6&&i%2===0)states.push({ply:i,state:{...clone(s),historyStates:history.slice(-48)}});
 const a=actions[i];if(!legal(s,a))throw Error('invalid source trace');
 history.push(clone(s));s=apply(s,a);
}
const workers={reference:new SigmaProcess({variant:'sigma3',simulations:100}),cached:new SigmaProcess({variant:'sigma3',simulations:100,cached:true})};
const report={version:'sigma4-inference-cache-reverse-order-v1',positions:states.length,results:[]};
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(const p of states){
  const results={};
  for(const key of ['cached','reference']){
   const start=performance.now(),r=await workers[key].search(p.state);
   if(!legal(p.state,r.pv?.[0]))throw Error('illegal '+key);
   results[key]={ms:performance.now()-start,action:r.pv[0],root:r.diagnostics?.rootChildren?.slice(0,3),cache:r.inferenceCache};
  }
  if(JSON.stringify(results.reference.action)!==JSON.stringify(results.cached.action))throw Error('cache changes action at '+p.ply);
  const row={ply:p.ply,referenceMs:results.reference.ms,cachedMs:results.cached.ms,cache:results.cached.cache};
  report.results.push(row);writeFileSync('evaluation/sigma4-cache-reverse-20261105.json',JSON.stringify(report,null,2)+'\n');
  console.log('CACHE',JSON.stringify(row));
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()))}
const mean=key=>report.results.reduce((sum,r)=>sum+r[key],0)/report.results.length;
report.summary={meanReferenceMs:mean('referenceMs'),meanCachedMs:mean('cachedMs'),hits:report.results.reduce((s,r)=>s+r.cache.hits,0),misses:report.results.reduce((s,r)=>s+r.cache.misses,0)};
writeFileSync('evaluation/sigma4-cache-reverse-20261105.json',JSON.stringify(report,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(report.summary));
