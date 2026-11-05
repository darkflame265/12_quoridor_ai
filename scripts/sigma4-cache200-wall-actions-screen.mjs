import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';

const source=JSON.parse(readFileSync('evaluation/sigma4-cache100-independent-paired-20261105.json'));
const games=[source.games.find(g=>g.opponent==='sigma2'&&g.variant==='original200'&&g.candidateSide===0),source.games.find(g=>g.opponent==='sigma3'&&g.variant==='cached100'&&g.candidateSide===1),source.games.find(g=>g.opponent==='weighted200'&&g.variant==='original200'&&g.candidateSide===0)];
assert(games.every(Boolean));
const positions=[];
for(let gi=0;gi<games.length;gi++){
 let state=initial(),history=[];
 for(let ply=0;ply<games[gi].actions.length;ply++){
  if(ply>=6&&ply<=45&&ply%4===gi%2*2)positions.push({id:gi+'-'+ply,state:{...clone(state),historyStates:history.slice(-48)}});
  const a=games[gi].actions[ply];
  assert(legal(state,a));
  history.push(clone(state));state=apply(state,a);
 }
}
const workers={original:new SigmaProcess({variant:'sigma3',simulations:200,cached:true}),cached:new SigmaProcess({variant:'sigma3',simulations:200,wallCached:true})};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
const report={version:'sigma4-cache200-wall-actions-pilot-v1',source:'prior recorded trajectories, training benchmark',positions:positions.map(p=>p.id),results:[]};
const pct=(a,p)=>[...a].sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(let i=0;i<positions.length;i++){
  const p=positions[i],result={id:p.id};
  const order=i%2===0?['original','cached']:['cached','original'];
  for(const variant of order){
   const start=performance.now(),r=await workers[variant].search(p.state);
   const wallMs=performance.now()-start;
   assert(legal(p.state,r.pv?.[0]),'illegal');
   result[variant]={wallMs,engineMs:r.elapsedMs,pv:r.pv,value:r.value,diagnostics:r.diagnostics?.rootChildren,cache:r.inferenceCache};
  }
  assert.deepEqual(result.cached.pv,result.original.pv,'PV changed '+p.id);
  assert.equal(result.cached.value,result.original.value,'root value changed '+p.id);
  assert.deepEqual(result.cached.diagnostics,result.original.diagnostics,'visits changed '+p.id);
  for(const variant of ['original','cached']){result[variant].diagnosticsHash=createHash('sha256').update(JSON.stringify(result[variant].diagnostics)).digest('hex');delete result[variant].diagnostics;}
  report.results.push(result);
  writeFileSync('evaluation/sigma4-cache200-wall-actions-screen-20261105.json',JSON.stringify(report,null,2)+'\n');
  console.log('CHECK',i+1,'/',positions.length,p.id,'original',Math.round(result.original.wallMs),'cached',Math.round(result.cached.wallMs),'hits',result.cached.cache?.hits);
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()));}
report.summary=Object.fromEntries(['original','cached'].map(variant=>{
 const times=report.results.map(r=>r[variant].wallMs),values=report.results.map(r=>r[variant]);
 return [variant,{count:times.length,meanMs:times.reduce((s,x)=>s+x,0)/times.length,p50Ms:pct(times,.5),p95Ms:pct(times,.95),p99Ms:pct(times,.99),maxMs:Math.max(...times),over500:times.filter(x=>x>500).length,cacheHits:values.reduce((s,v)=>s+(v.cache?.hits??0),0),cacheMisses:values.reduce((s,v)=>s+(v.cache?.misses??0),0)}];
}));
writeFileSync('evaluation/sigma4-cache200-wall-actions-screen-20261105.json',JSON.stringify(report,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(report.summary));
