import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply} from './engine.js';
import {recommendation,recordDecision,observedAction} from './decision-log.js';
test('decision audit ties advice to the original position and does not invent advice for a later position',()=>{
 const state=initial(),action={type:'move',x:4,y:7},log=[];
 const r=recommendation(state,{pv:[action],score:12,depth:5},{engine:'atlas-pressure',ms:500,cores:4,build:'abc'});recordDecision(log,r);
 observedAction(log,state,action,1);assert.equal(log.at(-1).matchesRecommendation,true);assert.equal(log[0].build,'abc');
 observedAction(log,apply(state,action),{type:'move',x:4,y:1},2);assert.equal(log.at(-1).matchesRecommendation,null);
 for(let i=0;i<1100;i++)recordDecision(log,{kind:'test',i});assert.equal(log.length,1000);assert.equal(log[0].i,100);
});
test('wall advice comparison ignores JSON property order',()=>{
 const state=initial(),log=[];recordDecision(log,recommendation(state,{pv:[{o:'h',type:'wall',x:4,y:5}]}));observedAction(log,state,{type:'wall',x:4,y:5,o:'h'},1);assert.equal(log.at(-1).matchesRecommendation,true);
});
