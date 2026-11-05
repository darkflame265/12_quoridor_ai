import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const data=JSON.parse(readFileSync('evaluation/sigma4-cache100-independent-paired-20261105.json'));
const conditions=[['sigma2','cached100',1],['sigma3','original200',0],['weighted200','cached100',1],['weighted200','original200',1]];
const states=[];
for(const [opponent,variant,side] of conditions){
 const game=data.games.find(g=>g.opponent===opponent&&g.variant===variant&&g.candidateSide===side);
 assert(game);
 let s=initial(),history=[];
 for(let ply=0;ply<game.actions.length;ply++){
  if([44,50,56,62,68].includes(ply)&&ply<game.actions.length-3)states.push({id:opponent+'-'+variant+'-'+side+'-'+ply,ply,walls:s.walls.length,state:{...clone(s),historyStates:history.slice(-48)}});
  const a=game.actions[ply];assert(legal(s,a));history.push(clone(s));s=apply(s,a);
 }
}
assert(states.length>=12);
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1'});
const workers={original:new SigmaProcess({variant:'sigma3',simulations:200,cached:true}),cached:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true})};
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const output={version:'sigma4-bitset-wall-lategame-20261105-v1',results:[]};
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(const [i,p] of states.entries()){
  const samples={};
  for(const type of (i%2?['cached','original']:['original','cached'])){
   const t=performance.now(),r=await workers[type].search(p.state);
   assert(legal(p.state,r.pv[0]));
   samples[type]={ms:performance.now()-t,pv:r.pv,value:r.value,rootChildren:r.diagnostics?.rootChildren,cache:r.inferenceCache};
  }
  assert.deepEqual(samples.original.pv,samples.cached.pv,'pv mismatch '+p.id);
  assert.equal(samples.original.value,samples.cached.value,'value mismatch '+p.id);
  assert.deepEqual(samples.original.rootChildren,samples.cached.rootChildren,'search mismatch '+p.id);
  output.results.push({id:p.id,ply:p.ply,walls:p.walls,originalMs:samples.original.ms,cachedMs:samples.cached.ms,cache:samples.cached.cache,rootHash:sha(samples.original.rootChildren)});
  writeFileSync('evaluation/sigma4-bitset-wall-lategame-20261105.json',JSON.stringify(output,null,2)+'\n');
  console.log('LATE',i+1,'/',states.length,p.id,'wallCount',p.walls,'original',Math.round(samples.original.ms),'cached',Math.round(samples.cached.ms),'hits',samples.cached.cache.hits);
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()));}
const arr=output.results.map(x=>x.cachedMs).sort((a,b)=>a-b);
output.summary={total:output.results.length,meanCached:arr.reduce((a,b)=>a+b,0)/arr.length,p95Cached:arr[Math.ceil(arr.length*.95)-1],over500:arr.filter(x=>x>500).length};
writeFileSync('evaluation/sigma4-bitset-wall-lategame-20261105.json',JSON.stringify(output,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(output.summary));
