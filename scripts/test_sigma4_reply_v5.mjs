import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedReplyV5} from './sigma4-reply-search-v5.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
const data=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const game=data.games.find(g=>g.index===14);
const makeRng=seed=>{let n=seed>>>0;return{get state(){return n},next(){n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296}}};
let state=initial(),checked=false;
for(const action of data.fixtures.find(f=>f.id===game.fixture).actions)state=apply(state,action);
const rng=makeRng(game.seed);
for(const t of game.trace){
 if(t.engine==='candidate'){
  const search={pv:[t.baseAction],diagnostics:{rootChildren:t.rootChildren}};
  const clone=makeRng(rng.state);
  const old=chooseWeightedResearchCandidate(state,search,()=>rng.next(),data.settings.rootChoice);
  assert.deepEqual(old.action,t.action);
  if(t.ply===20){
   const fallbackRng=makeRng(clone.state);
   const expected=chooseWeightedTacticalV3(state,search,()=>fallbackRng.next(),data.settings.rootChoice);
   assert(expected.changed,'fixture must exercise weighted alternative');
   let replies=0;
   const actual=await chooseWeightedReplyV5(state,search,()=>clone.next(),async()=>{replies++;throw Error('simulated reply search failure')},data.settings.rootChoice);
   assert.equal(replies,2);
   assert.equal(actual.replyGate,'unavailable');
   assert(legal(state,actual.action));
   assert.deepEqual(actual.action,expected.action);
   checked=true;
   break;
  }
 }
 state=apply(state,t.action);
}
assert(checked);
console.log('PASS V5 failure fallback with both reply searches attempted');
