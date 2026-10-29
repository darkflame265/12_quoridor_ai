import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,clone} from './engine.js';
import {pressureMetrics,pressureExplanation} from './pressure-advice.js';
const wall=(x,y,o='h')=>({type:'wall',x,y,o});
test('near path interruption outranks equal-distance far interruption in bounded pressure utility',()=>{
 const s={...initial(),p:[{x:0,y:6},{x:4,y:2}]},before=clone(s),near=pressureMetrics(s,wall(3,2)),far=pressureMetrics(s,wall(3,6));
 assert.equal(near.enemyDelay,far.enemyDelay);assert.equal(near.ownDelay,0);assert.equal(near.placementCost,1);assert.equal(near.firstContact,0);assert.equal(far.firstContact,4);assert.ok(near.bias>far.bias);assert.ok(near.bias<=24);assert.deepEqual(s,before);
});
test('walls that harm own route or allow an immediate loss receive no pressure bonus',()=>{
 const s={...initial(),p:[{x:4,y:6},{x:4,y:2}]},harm=pressureMetrics(s,wall(3,2));assert.ok(harm.netGain<0);assert.equal(harm.bias,0);
 const urgent={...initial(),p:[{x:0,y:5},{x:4,y:7}]};assert.equal(pressureMetrics(urgent,wall(2,2)).bias,0);
});
test('pressure metrics preserve color rotation and include all shortest branches',()=>{
 const s={...initial(),p:[{x:0,y:6},{x:4,y:2}]},a=wall(3,2),flipped={...s,p:s.p.map(p=>({x:8-p.x,y:8-p.y})).reverse(),left:[...s.left].reverse(),turn:1-s.turn},b=wall(7-a.x,7-a.y);
 assert.deepEqual(pressureMetrics(s,a),pressureMetrics(flipped,b));assert.ok(pressureMetrics(s,a).nearCutEdges>0);
});
test('explanation distinguishes delayed walls, local walls and pawn progress',()=>{
 const s={...initial(),p:[{x:0,y:6},{x:4,y:2}]};assert.match(pressureExplanation(s,wall(3,2)),/1번째 구간 차단/);assert.match(pressureExplanation(s,wall(3,6)),/5번째 구간에서 효과/);assert.match(pressureExplanation(s,{type:'move',x:0,y:5}),/내 경로 -1칸/);assert.equal(pressureExplanation(s,{type:'move',x:8,y:8}),'');
});
