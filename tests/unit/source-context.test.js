import test from 'node:test';
import assert from 'node:assert/strict';
import {readStartingColor} from '../../src/capture/source-context.js';
import {screenFixture} from '../fixtures/screen-board.mjs';
import {initial,apply} from '../../src/game/engine.js';
import {StableScreenBoard,recoverScreenMoves,recoverScreenSequence} from '../../src/capture/screen-sync.js';
test('starting-row tint identifies either own color independently of pawn position',()=>{
 for(const bottom of [0,1])for(const scale of [1,2]){const f=screenFixture({bottom,scale});assert.equal(readStartingColor(f,f.crop,f.gap).bottom,bottom);}
});
test('goal-color inference tolerates local occlusion but rejects contradictory rows',()=>{
 const f=screenFixture();for(let y=488;y<536;y++)for(let x=24;x<130;x++)f.data.set([17,19,15,255],(y*f.width+x)*4);assert.equal(readStartingColor(f,f.crop,f.gap).bottom,0);
 for(let y=24;y<72;y++)for(let x=24;x<536;x++)f.data.set([30,75,70,255],(y*f.width+x)*4);assert.equal(readStartingColor(f,f.crop,f.gap).bottom,null);
});
test('absent goal colors do not silently reuse a previous own side',()=>{
 const f=screenFixture();f.data.fill(0);assert.equal(readStartingColor(f,f.crop,f.gap).bottom,null);
});
test('frame stability includes independently observed turn',()=>{
 const gate=new StableScreenBoard(3),s=initial();assert.equal(gate.observe(s,0),false);assert.equal(gate.observe(s,0),false);assert.equal(gate.observe(s,1),false);assert.equal(gate.observe(s,1),false);assert.equal(gate.observe(s,1),true);
});
test('source turn and move count constrain recovery instead of rewriting the tracked turn',()=>{
 const s=initial(),step={type:'move',x:4,y:7},target=apply(s,step);
 assert.deepEqual(recoverScreenMoves(s,target,{expectedTurn:1,expectedPlies:1}),[step]);
 assert.throws(()=>recoverScreenMoves(s,target,{expectedTurn:0,expectedPlies:1}));
 assert.throws(()=>recoverScreenSequence(s,s,[],{expectedTurn:1}));
 assert.throws(()=>recoverScreenSequence(s,target,[target],{expectedTurn:1,expectedPlies:0}));
});
test('six-ply recovery accepts matching source count and rejects conflicting counter',()=>{
 const s=initial(),steps=[{type:'move',x:4,y:7},{type:'move',x:4,y:1},{type:'move',x:4,y:6},{type:'move',x:4,y:2},{type:'move',x:4,y:5},{type:'move',x:4,y:3}],target=steps.reduce(apply,s);
 assert.deepEqual(recoverScreenMoves(s,target,{expectedTurn:0,expectedPlies:6,maxMs:1000}),steps);
 assert.throws(()=>recoverScreenMoves(s,target,{expectedTurn:1,expectedPlies:5,maxMs:1000}));
});
