import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';

const source=JSON.parse(readFileSync('evaluation/sigma4-cache100-independent-paired-20261105.json'));
const games=[source.games.find(g=>g.opponent==='sigma2'&&g.variant==='original200'&&g.candidateSide===0),source.games.find(g=>g.opponent==='sigma3'&&g.variant==='cached100'&&g.candidateSide===1),source.games.find(g=>g.opponent==='weighted200'&&g.variant==='original200'&&g.candidateSide===0)];
assert(games.every(Boolean));
const states=[];
for(let gi=0;gi<games.length;gi++){
 const game=games[gi];let s=initial(),history=[];
 for(let i=0;i<game.actions.length;i++){
  if(i>=6&&i<=45&&i%4===gi%2*2)states.push({id:gi+'-'+i,state:{...clone(s),historyStates:history.slice(-48)}});
  assert(legal(s,game.actions[i]),'source mismatch');
  history.push(clone(s));s=apply(s,game.actions[i]);
 }
}
const sizes=[2048,4096,8192],workers=Object.fromEntries(sizes.map(size=>[size,new SigmaProcess({variant:'sigma3',simulations:200,cacheCapacity:size})]));
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
const out={version:'sigma4-cache-capacity-screen-v1',sizes,positions:states.map(s=>s.id),settings:{simulations:200,worker:'isolated-sigma3-lru',treeReuse:false},results:[]};
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(let i=0;i<states.length;i++){
  const state=states[i],result={id:state.id};
  const order=i%2===0?sizes:[...sizes].reverse();
  for(const size of order){
   const t=performance.now(),r=await workers[size].search(state.state),wallMs=performance.now()-t;
   if(!legal(state.state,r.pv?.[0]))throw Error('illegal result');
   result[size]={wallMs,engineMs:r.elapsedMs,pv:r.pv,value:r.value,rootChildren:r.diagnostics?.rootChildren,cache:r.inferenceCache};
  }
  assert.deepEqual(result[4096].pv,result[2048].pv);
  assert.deepEqual(result[8192].pv,result[2048].pv);
  assert.deepEqual(result[4096].rootChildren,result[2048].rootChildren);
  assert.deepEqual(result[8192].rootChildren,result[2048].rootChildren);
  assert.equal(result[4096].value,result[2048].value);
  assert.equal(result[8192].value,result[2048].value);
  for(const size of sizes){result[size].rootChildrenHash=createHash('sha256').update(JSON.stringify(result[size].rootChildren)).digest('hex');delete result[size].rootChildren;}
  out.results.push(result);
  writeFileSync('evaluation/sigma4-cache-capacity-20261105.json',JSON.stringify(out,null,2)+'\n');
  console.log('CAPACITY',i+1,'/',states.length,state.id,sizes.map(z=>z+':'+Math.round(result[z].wallMs)+'ms,'+result[z].cache.hits+'hits').join(' '));
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()));}
const percentile=(a,p)=>[...a].sort((x,y)=>x-y)[Math.ceil(a.length*p)-1];
out.summary=Object.fromEntries(sizes.map(z=>{
 const v=out.results.map(x=>x[z]),times=v.map(x=>x.wallMs);
 return [z,{count:v.length,meanMs:times.reduce((a,b)=>a+b,0)/times.length,p95Ms:percentile(times,.95),p99Ms:percentile(times,.99),maxMs:Math.max(...times),over500:times.filter(x=>x>500).length,hits:v.reduce((s,x)=>s+x.cache.hits,0),misses:v.reduce((s,x)=>s+x.cache.misses,0),evictions:v.reduce((s,x)=>s+x.cache.evictions,0),peakRSSBytes:Math.max(...v.map(x=>x.cache.rssBytes)),maxEntries:Math.max(...v.map(x=>x.cache.entries))}];
}));
writeFileSync('evaluation/sigma4-cache-capacity-20261105.json',JSON.stringify(out,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(out.summary));
