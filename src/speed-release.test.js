import test from 'node:test';import assert from 'node:assert/strict';
import {assessSpeed} from '../evaluation/speed-release-policy.mjs';
function arena(split,pairs){const games=[];for(const suite of ['general','maze'])for(let openingIndex=0;openingIndex<pairs;openingIndex++)for(const candidateSide of [0,1])games.push({suite,openingIndex,candidateSide,replayValidated:true,result:candidateSide===0?'win':'draw'});
 return {status:'completed',split,pairs,games,identity:{source:'fixed'},baselineBinary:'baseline',summary:{win:pairs*2,loss:0},ms:500,cores:4,maxPlies:180,cohort:'search65-v1',tactics:Array.from({length:16},()=>({pass:true})),timing:{candidate:{moves:100,overruns:0}}};}
test('speed-only release requires parity, paired 100-game validation and separate holdout',()=>{
 const v=arena('validation',25),h=arena('holdout',4),position={depth:2,score:100,nodes:200,pv:[{type:'move',x:4,y:7}]},b={identity:v.identity,baselineBinary:'baseline',fixed:Array.from({length:50},()=>({original:structuredClone(position),optimized:structuredClone(position)})),summary:{fixedOriginalMs:100,fixedOptimizedMs:60}};
 assert.equal(assessSpeed(v,h,b).eligible,true);
 for(const mutate of [x=>x.v.games.pop(),x=>x.h.split='validation',x=>x.b.fixed[0].optimized.score++,x=>x.v.summary.loss=100,x=>x.h.games.filter(g=>g.suite==='maze').forEach(g=>g.result='loss'),x=>x.h.tactics[0].pass=false,x=>x.v.timing.candidate.overruns=5,x=>x.h.identity.source='changed']){
  const x=structuredClone({v,h,b});mutate(x);assert.equal(assessSpeed(x.v,x.h,x.b).eligible,false);
 }
});
