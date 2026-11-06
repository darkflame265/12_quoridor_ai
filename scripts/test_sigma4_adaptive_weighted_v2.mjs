import assert from 'node:assert/strict';
import {initial,moves,legal} from '../src/engine.js';
import {chooseAdaptiveWeightedCandidate} from './sigma4-adaptive-weighted-v2.mjs';
const s=initial(),[a,b,c]=moves(s);
const r={pv:[a],diagnostics:{rootChildren:[
{action:a,visits:100,qFromRoot:.50},
{action:b,visits:70,qFromRoot:.49},
{action:c,visits:4,qFromRoot:.48}
]}};
const skip=chooseAdaptiveWeightedCandidate(s,r,()=>0,{overrides:3});
assert.equal(skip.reason,'override-budget');assert.deepEqual(skip.action,a);
const available=chooseAdaptiveWeightedCandidate(s,r,()=>0.8,{baseRate:1,overrides:0});
assert.ok(legal(s,available.action));
assert.notDeepEqual(available.action,c);
const crisis={...s,p:[{x:4,y:4},{x:4,y:6}],turn:0};
const cr={pv:moves(crisis).slice(0,1),diagnostics:{rootChildren:[]}};
const safe=chooseAdaptiveWeightedCandidate(crisis,cr,()=>0);
assert.equal(safe.reason,'goal-race-guard');assert.deepEqual(safe.action,cr.pv[0]);
const unsupported=chooseAdaptiveWeightedCandidate(s,r,()=>0,{minVisitRatio:.99,minVisits:150});
assert.equal(unsupported.changed,false);
console.log('PASS adaptive v2: legal moves, visit screening, override budget, endgame safety');
