import assert from 'node:assert/strict';
import {initial,moves,apply,legal} from '../src/engine.js';
import {chooseTacticalSigma4} from './sigma4-tactical-choice.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const state=initial();
const [a,b,c]=moves(state);
const result={pv:[a],diagnostics:{rootChildren:[
 {action:a,visits:110,qFromRoot:.53},
 {action:b,visits:60,qFromRoot:.51},
 {action:c,visits:30,qFromRoot:.5}
]}};
const changed=chooseTacticalSigma4(state,result,(vals=>()=>vals.shift()??0)([0,.9999]),{rate:1});
assert.ok(legal(state,changed.action));
assert.notEqual(changed.reason,'forced-immediate-win');
const fallback=chooseTacticalSigma4(state,result,()=>.99,{rate:0});
assert.ok(same(fallback.action,a));
const winState={...initial(),p:[{x:4,y:1},{x:8,y:0}],turn:0};
const auto=chooseTacticalSigma4(winState,{pv:[{type:'move',x:3,y:1}],diagnostics:{rootChildren:[]}},()=>0);
assert.equal(auto.reason,'forced-immediate-win');assert.deepEqual(auto.action,{type:'move',x:4,y:0});
const threatened={...initial(),p:[{x:4,y:5},{x:4,y:7}],turn:0};
const run={pv:[{type:'move',x:4,y:4}],diagnostics:{rootChildren:[
 {action:{type:'move',x:4,y:4},visits:100,qFromRoot:.3},
 {action:{type:'wall',x:4,y:7,o:'h'},visits:35,qFromRoot:.29}
]}};
const protect=chooseTacticalSigma4(threatened,run,()=>0,{rate:1});
assert.equal(protect.reason,'avoid-next-turn-loss');assert.equal(protect.action.type,'wall');
assert.ok(legal(threatened,protect.action));
console.log('PASS tactical Sigma4 immediate win, one-ply loss block, safe weighted fallback');
