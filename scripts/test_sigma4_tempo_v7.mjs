import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply,clone,legal,distance,moves} from '../src/engine.js';
import {chooseWeightedTempoV7} from './sigma4-tempo-guard-v7.mjs';
const data=JSON.parse(readFileSync('evaluation/sigma4-bitset200-vs-sigma23-20261105.json'));
const losing=data.games.find(g=>g.opponent==='sigma3'&&!g.candidateWon&&g.candidateSide===1);
assert(losing);
let state=initial();
const records=[];
for(let ply=0;ply<losing.actions.length;ply++){
 if([53,55].includes(ply)){
  const bad=losing.actions[ply];
  assert.equal(bad.type,'wall');
  assert.equal(state.turn,losing.candidateSide);
  const root={pv:[bad],diagnostics:{rootChildren:[{action:bad,visits:70,qFromRoot:.2}]}};
  const outcome=chooseWeightedTempoV7(state,root,()=>.99,{});
  assert.equal(outcome.tempoGate,'replaced','expected tempo regression to be rejected at ply '+ply);
  assert.equal(outcome.action.type,'move');
  assert(legal(state,outcome.action));
  assert(distance(apply(state,outcome.action),state.turn)<distance(state,state.turn));
  records.push({ply,previous:bad,suggested:outcome.action,deficit:outcome.deficit,ownChange:outcome.ownChange,oppChange:outcome.oppChange});
 }
 state=apply(state,losing.actions[ply]);
}
const start=initial();
const action=moves(start)[0];
assert(legal(start,action));
const ref={pv:[action],diagnostics:{rootChildren:[{action,visits:100,qFromRoot:.2}]}};
const noChange=chooseWeightedTempoV7(start,ref,()=>.99);
assert.equal(noChange.tempoGate,'not-wall');
assert.deepEqual(noChange.action,action);
console.log('PASS V7 loss-wall tempo audit',JSON.stringify(records));
