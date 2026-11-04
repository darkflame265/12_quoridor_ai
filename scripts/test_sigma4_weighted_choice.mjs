import assert from 'node:assert/strict';
import {initial,moves,legal} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
const s=initial(), [a,b,c]=moves(s);
const search={pv:[a],diagnostics:{rootChildren:[
 {action:a,visits:100,qFromRoot:.6},
 {action:b,visits:35,qFromRoot:.57},
 {action:c,visits:15,qFromRoot:.4}
]}};
const native=chooseWeightedResearchCandidate(s,search,()=>.99,{rate:.5});
assert.deepEqual(native.action,a);
assert.equal(native.changed,false);
const sampled=chooseWeightedResearchCandidate(s,search,()=>0,{rate:1,maxQDrop:.08});
assert.ok(legal(s,sampled.action));assert.equal(sampled.candidates,2);
const branch=chooseWeightedResearchCandidate(s,search,(n=>()=>n.shift()??0)([0,.9999]),{rate:1,maxQDrop:.08});
assert.deepEqual(branch.action,b);
assert.equal(branch.changed,true);
assert.ok(branch.probability>0&&branch.probability<1);
const low=chooseWeightedResearchCandidate(s,search,()=>.99999,{rate:1,maxQDrop:.005});
assert.deepEqual(low.action,a);
const before=JSON.stringify(s);
for(let i=1;i<50;i++){
 const val=(i%47)/47;
 const chosen=chooseWeightedResearchCandidate(s,search,(n=>()=>n.shift()??0)([0,val]),{rate:1});
 assert.ok(legal(s,chosen.action));
}
assert.equal(JSON.stringify(s),before);
console.log('PASS SIGMA4 weighted MCTS root: legality, visit and value weighting, temperature, native fallback, preserved root');
