import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply} from '../../src/game/engine.js';
import {recommendation,recordDecision,observedAction} from '../../src/history/decision-log.js';
test('decision audit ties advice to the original position and does not invent advice for a later position',()=>{
 const state=initial(),action={type:'move',x:4,y:7},log=[];
 const r=recommendation(state,{pv:[action],score:12,depth:5},{engine:'atlas-pressure',ms:500,cores:4,build:'abc'});recordDecision(log,r);
 observedAction(log,state,action,1);assert.equal(log.at(-1).matchesRecommendation,true);assert.equal(log[0].build,'abc');
 observedAction(log,apply(state,action),{type:'move',x:4,y:1},2);assert.equal(log.at(-1).matchesRecommendation,null);
 for(let i=0;i<1100;i++)recordDecision(log,{kind:'test',i});assert.equal(log.length,1000);assert.equal(log[0].i,100);
});
test('changed intermediate advice remains available when the final advice differs from the action',()=>{
 const s=initial(),a={type:'move',x:4,y:7},b={type:'move',x:3,y:8},log=[];
 recordDecision(log,recommendation(s,{pv:[a],done:false,depth:2}));recordDecision(log,recommendation(s,{pv:[b],done:false,depth:3}));recordDecision(log,recommendation(s,{pv:[b],done:true,depth:4}));
 assert.equal(log.length,3);observedAction(log,s,a,1);assert.equal(log.at(-1).matchesRecommendation,false);assert.ok(log.at(-1).earlierMatchingRecommendationAt);
});
test('wall advice comparison ignores JSON property order',()=>{
 const state=initial(),log=[];recordDecision(log,recommendation(state,{pv:[{o:'h',type:'wall',x:4,y:5}]}));observedAction(log,state,{type:'wall',x:4,y:5,o:'h'},1);assert.equal(log.at(-1).matchesRecommendation,true);
});
test('audit preserves goal safety and exact ending evidence without borrowing mutable model data',()=>{
 const result={pv:[{type:'move',x:4,y:7}],exact:false,outcome:null,goalSafety:{goalThreat:true,exposure:[1,0],wallStock:[2,3]}};
 const entry=recommendation(initial(),result,{engine:'atlas-goal',build:'checked'});result.goalSafety.exposure[0]=9;
 assert.equal(entry.goalSafety.exposure[0],1);assert.equal(entry.exact,false);assert.equal(entry.outcome,null);
 const solved=recommendation(initial(),{pv:result.pv,exact:true,outcome:-1});assert.equal(solved.exact,true);assert.equal(solved.outcome,-1);
});
