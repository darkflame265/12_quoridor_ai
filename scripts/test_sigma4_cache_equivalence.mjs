import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1'});
const data=JSON.parse(readFileSync('evaluation/sigma4-budget-unseen100-vs-200-20261105.json'));
const actions=data.games[0].actions;
const positions=[];let s=initial(),history=[];
for(let i=0;i<actions.length&&i<18;i++){
 if(i>=6&&i%2===0)positions.push({ply:i,s:{...clone(s),historyStates:history.slice(-48)}});
 assert(legal(s,actions[i]));history.push(clone(s));s=apply(s,actions[i]);
}
let checked=0,hits=0;
for(const sims of [100,200]){
 const original=new SigmaProcess({variant:'sigma3',simulations:sims});
 const cached=new SigmaProcess({variant:'sigma3',simulations:sims,cached:true});
 try{
  await Promise.all([original.health(),cached.health()]);
  for(const p of positions){
   const a=await original.search(p.s),b=await cached.search(p.s);
   assert.deepEqual(b.pv,a.pv,'PV mismatch at '+p.ply+' sims '+sims);
   assert.equal(b.value,a.value,'root eval mismatch');
   assert.deepEqual(b.diagnostics?.rootChildren,a.diagnostics?.rootChildren,'MCTS scores mismatch');
   assert.equal(b.simulations,a.simulations);
   hits+=b.inferenceCache.hits;checked++;
  }
 }finally{await Promise.all([original.close(),cached.close()]);}
}
assert(hits>0);
console.log('PASS cached ONNX matches uncached search',JSON.stringify({checked,hits}));
