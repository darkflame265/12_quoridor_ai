import assert from 'node:assert/strict';
import {initial,moves,legal} from '../src/engine.js';
import {chooseGuardedSigma4Candidate} from './sigma4-guarded-research-choice.mjs';
const state=initial(),[a,b,c]=moves(state);
const search=(visits,q)=>({pv:[a],diagnostics:{rootChildren:[
 {action:a,visits:visits[0],qFromRoot:q[0]},{action:b,visits:visits[1],qFromRoot:q[1]},
 {action:c,visits:visits[2],qFromRoot:q[2]}
]}});
const native=chooseGuardedSigma4Candidate(state,search([191,5,4],[.6,.56,.54]),()=>0,{rate:1});
assert.equal(native.changed,false);assert.equal(native.reason,'dominant-native-root');
const noAlt=chooseGuardedSigma4Candidate(state,search([95,75,30],[.6,.4,.3]),()=>0,{rate:1});
assert.equal(noAlt.changed,false);assert.equal(noAlt.reason,'no-reliable-alternative');
const sample=chooseGuardedSigma4Candidate(state,search([90,70,40],[.6,.59,.55]),(a=>()=>a.shift()??0)([0,.99]),{rate:1});
assert.ok(legal(state,sample.action));assert.equal(sample.changed,true);assert.notDeepEqual(sample.action,a);
const skipped=chooseGuardedSigma4Candidate(state,search([90,70,40],[.6,.59,.55]),()=>.999,{rate:.1});
assert.equal(skipped.changed,false);
console.log('PASS SIGMA4 conservative gated sampler: dominant roots, Q gap, visits, legal candidate');
