import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {encodePosition,legalActions,policyIndex} from '../../src/ai/browser-position.js';
import {initial,apply,legal,moves,validWall} from '../../src/game/engine.js';
import {searchBrowser} from '../../src/ai/browser-search.js';
const fixtures=JSON.parse(readFileSync(new URL('../fixtures/sigma-browser-parity.json',import.meta.url)));
const canonical=a=>JSON.stringify([a.type,a.x,a.y,a.o??null]);
test('browser tensors, policy indices and legal actions match Python Sigma on both turns and jumps',()=>{
 for(const f of fixtures){assert.deepEqual([...encodePosition(f.state)],f.input);const actions=legalActions(f.state);assert.deepEqual(actions.map(canonical).sort(),f.actions.map(x=>canonical(x.action)).sort());for(const x of f.actions)assert.equal(policyIndex(f.state,x.action),x.index);}
});
test('fast wall legality matches reference over a deterministic changing game',()=>{
 let s=initial();for(let ply=0;ply<22&&s.winner===null;ply++){
  const fast=legalActions(s),reference=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const a={type:'wall',x,y,o};if(validWall(s,a))reference.push(a);}
  assert.deepEqual(fast.map(canonical).sort(),reference.map(canonical).sort());s=apply(s,fast[(ply*71+19)%fast.length]);
 }
});
test('PUCT produces legal actions, respects simulation budget and prioritizes immediate goals',async()=>{
 const evaluator=async()=>({policy:new Float32Array(136),value:0});let s=initial();s.p[0]={x:4,y:1};
 const r=await searchBrowser(s,evaluator,{ms:500,maxSimulations:10});assert.ok(legal(s,r.pv[0]));assert.equal(r.pv[0].y,0);assert.ok(r.simulations<=10);
});
test('cancelled inference cannot publish stale advice',async()=>{
 let cancelled=false;await assert.rejects(searchBrowser(initial(),async()=>{cancelled=true;return {policy:new Float32Array(136),value:0};},{cancelled:()=>cancelled}),{name:'AbortError'});
});
