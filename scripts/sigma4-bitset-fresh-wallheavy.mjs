import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,moves,validWall} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;}};
const sha=a=>createHash('sha256').update(JSON.stringify(a)).digest('hex');
const fixtures=[];
for(let game=0;game<14;game++){
 const random=rng(20261105+game*7919);
 let s=initial(),history=[],applied=[];
 const plies=14+(game%5)*2;
 for(let ply=0;ply<plies&&s.winner===null;ply++){
  const pawns=moves(s);
  const walls=[];
  if(s.left[s.turn]>0)for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
   const a={type:'wall',x,y,o};
   if(validWall(s,a))walls.push(a);
  }
  const chooseWall=walls.length&&random()<0.74;
  const pool=chooseWall?walls:pawns;
  if(!pool.length)break;
  const a=pool[Math.floor(random()*pool.length)];
  if(!legal(s,a))throw Error('invalid generated action');
  history.push(clone(s));applied.push(a);s=apply(s,a);
 }
 if(s.winner!==null)continue;
 fixtures.push({id:'seed-'+game+'-'+plies,state:{...clone(s),historyStates:history.slice(-48)},historyHash:sha(applied),walls:s.walls.length,plies:applied.length});
}
assert(fixtures.length>=10);
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
const workers={original:new SigmaProcess({variant:'sigma3',simulations:200,cached:true}),bitset:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true})};
const report={version:'sigma4-bitset-fresh-wallheavy-pilot-v1',positions:fixtures.map(f=>({id:f.id,hash:f.historyHash,walls:f.walls,plies:f.plies})),results:[]};
const pct=(array,p)=>[...array].sort((a,b)=>a-b)[Math.ceil(array.length*p)-1];
try{
 await Promise.all(Object.values(workers).map(x=>x.health()));
 for(const [i,f] of fixtures.entries()){
  const output={id:f.id,walls:f.walls,plies:f.plies};
  for(const variant of (i%2?['bitset','original']:['original','bitset'])){
   const start=performance.now(),r=await workers[variant].search(f.state);
   assert(legal(f.state,r.pv[0]));
   output[variant]={wallMs:performance.now()-start,pv:r.pv,value:r.value,root:r.diagnostics?.rootChildren,cache:r.inferenceCache};
  }
  assert.deepEqual(output.original.pv,output.bitset.pv,'PV mismatch '+f.id);
  assert.equal(output.original.value,output.bitset.value,'root mismatch '+f.id);
  assert.deepEqual(output.original.root,output.bitset.root,'MCTS mismatch '+f.id);
  const rootHash=sha(output.original.root);
  for(const v of ['original','bitset']){delete output[v].root;output[v].rootHash=rootHash;}
  report.results.push(output);
  writeFileSync('evaluation/sigma4-bitset-fresh-wallheavy-20261105.json',JSON.stringify(report,null,2)+'\n');
  console.log('FRESH',i+1,'/',fixtures.length,'walls',f.walls,'original',Math.round(output.original.wallMs),'bitset',Math.round(output.bitset.wallMs));
 }
}finally{await Promise.all(Object.values(workers).map(x=>x.close()));}
report.summary=Object.fromEntries(['original','bitset'].map(v=>{
 const a=report.results.map(x=>x[v].wallMs);
 return [v,{count:a.length,meanMs:a.reduce((s,x)=>s+x,0)/a.length,p95Ms:pct(a,.95),p99Ms:pct(a,.99),maxMs:Math.max(...a),over500:a.filter(x=>x>500).length}];
}));
writeFileSync('evaluation/sigma4-bitset-fresh-wallheavy-20261105.json',JSON.stringify(report,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(report.summary));
