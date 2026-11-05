import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
import {chooseWeightedSelectiveV6} from './sigma4-selective-v6.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
const d=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const game=d.games.find(g=>g.index===14),rng=seed=>{let s=seed>>>0;return{get state(){return s},next(){s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296}}};
let s=initial(),hit=false;for(const a of d.fixtures.find(f=>f.id===game.fixture).actions)s=apply(s,a);
const results=[];
for(const t of game.trace){
 if(t.engine==='candidate'){
  const r=rng(game.seed); // Rebuild the original seed stream below.
 }
 s=apply(s,t.action);
}
s=initial();for(const a of d.fixtures.find(f=>f.id===game.fixture).actions)s=apply(s,a);
const stream=rng(game.seed);
for(const t of game.trace){
 if(t.engine==='candidate'){
  const snapshot=rng(stream.state),root={pv:[t.baseAction],diagnostics:{rootChildren:t.rootChildren},elapsedMs:510};
  const original=chooseWeightedResearchCandidate(s,root,()=>stream.next(),d.settings.rootChoice);
  assert.deepEqual(original.action,t.action);
  if(t.ply===20){
   const savedSeed=snapshot.state;let calls=0;
   const v6=await chooseWeightedSelectiveV6(s,root,()=>snapshot.next(),async()=>{calls++;throw Error('must not run');},d.settings.rootChoice);
   assert(legal(s,v6.action));assert.equal(calls,0);assert.equal(v6.selective,'budget-exhausted');
   const retry=rng(savedSeed);const start=performance.now();
   const v6b=await chooseWeightedSelectiveV6(s,{...root,elapsedMs:0},()=>retry.next(),async()=>new Promise(()=>{}),{...d.settings.rootChoice,moveBudgetMs:120,reserveMs:10,minReplyMs:20});
   const elapsed=performance.now()-start;
   assert(elapsed<450,'timeout cannot hang');
   assert.equal(v6b.selective,'fallback');assert(legal(s,v6b.action));
   results.push({budgetGate:v6.selective,timeoutGate:v6b.selective,elapsedMs:elapsed});
   hit=true;break;
  }
 }
 s=apply(s,t.action);
}
assert(hit);console.log('PASS V6 budget and timeout',results);
