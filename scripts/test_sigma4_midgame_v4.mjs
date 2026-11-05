import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply,legal,moves} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedMidgameV4} from './sigma4-midgame-risk-v4.mjs';
const data=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const rngState=seed=>{let n=seed>>>0;return{get state(){return n;},next(){n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const goalInOne=(state,action)=>{
 const next=apply(state,action);
 return next.winner===null&&moves(next).some(a=>apply(next,a).winner===next.turn);
};
let checked=0,gate=0,divergences=0;
for(const game of data.games){
 let s=initial();
 for(const a of data.fixtures.find(f=>f.id===game.fixture).actions)s=apply(s,a);
 const rng=rngState(game.seed);
 for(const t of game.trace){
  if(t.engine==='candidate'){
   const search={pv:[t.baseAction],diagnostics:{rootChildren:t.rootChildren}};
   const copy=rngState(rng.state);
   const original=chooseWeightedResearchCandidate(s,search,()=>rng.next(),data.settings.rootChoice);
   assert(same(original.action,t.action),'recorded stochastic move must reproduce');
   const v4=chooseWeightedMidgameV4(s,search,()=>copy.next(),data.settings.rootChoice);
   assert(legal(s,v4.action),'v4 must always choose a legal move');
   if(!goalInOne(s,original.action))assert(!goalInOne(s,v4.action),'v4 must never introduce a goal-in-one loss');
   gate+=Number(v4.reason==='midgame-path-risk-gate');
   divergences+=Number(!same(original.action,v4.action));
   checked++;
  }
  s=apply(s,t.action);
 }
}
assert.equal(checked,708);
assert.equal(gate,2);
assert.equal(divergences,4);
console.log('PASS midgame-v4 historical safety and reproducibility', {checked,gate,divergences});
