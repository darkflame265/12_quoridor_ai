import test from 'node:test';
import assert from 'node:assert/strict';
import {screenFixture} from '../scripts/test-fixtures/screen-board.mjs';
import {recognizeBoard} from './screen-recognition.js';
import {readSourceContext} from './source-context.js';
const initial=[{x:4,y:8},{x:4,y:0}],three=[{x:3,y:8},{x:5,y:8},{x:4,y:7}];
function read({positions=initial,installed=[],owner=0,targets=three,bottom=0,...options}={}){const f=screenFixture({positions,installed,bottom,dots:targets.map(p=>({...p,owner})),...options});return {f,board:recognizeBoard(f,f.crop,{gap:f.gap}),context:readSourceContext(f,f.crop,{gap:f.gap})};}
test('initial three move dots identify own turn without any source captions or cards',()=>{
 for(const scale of [1,2])for(const dotOpacity of [.35,1]){const r=read({scale,dotOpacity});assert.equal(r.board.dots.length,3);assert.deepEqual(r.board.p,initial);assert.equal(r.context.turn,0);assert.equal(r.context.relative,'self');assert.match(r.context.turnReason,/이동 점 3개/);}
});
test('pink below uses pink dots and real owner rather than pawn proximity or first-player assumption',()=>{
 const r=read({positions:[initial[1],initial[0]],bottom:1,owner:1,dotOpacity:.35});assert.equal(r.context.turn,1);assert.equal(r.context.relative,'self');
});
test('one, two and four legal destinations are accepted without a fixed dot count',()=>{
 const cases=[{positions:[{x:0,y:8},{x:4,y:0}],targets:[{x:0,y:7},{x:1,y:8}]},{positions:[{x:0,y:8},{x:4,y:0}],installed:[{type:'wall',o:'h',x:0,y:7,owner:1}],targets:[{x:1,y:8}]},{positions:[{x:4,y:4},{x:0,y:0}],targets:[{x:4,y:3},{x:5,y:4},{x:4,y:5},{x:3,y:4}]}];
 for(const c of cases){const r=read(c);assert.equal(r.context.turn,0);assert.equal(r.board.dots.length,c.targets.length);}
});
test('straight and diagonal jumps require the actual jumping destinations',()=>{
 const positions=[{x:4,y:4},{x:4,y:3}],straight=[{x:4,y:2},{x:5,y:4},{x:4,y:5},{x:3,y:4}],diagonal=[{x:3,y:3},{x:5,y:3},{x:5,y:4},{x:4,y:5},{x:3,y:4}];
 assert.equal(read({positions,targets:straight}).context.turn,0);
 const installed=[{type:'wall',o:'h',x:4,y:2,owner:1}];assert.equal(read({positions,installed,targets:diagonal}).context.turn,0);
 assert.equal(read({positions,installed,targets:straight}).context.turn,null);
});
test('missing, partial, extra illegal and wrong-color dots never imply the other players turn',()=>{
 for(const targets of [[],three.slice(0,2),[...three,{x:0,y:4}]])assert.equal(read({targets}).context.turn,null);
 assert.equal(read({owner:1}).context.turn,null);
});
test('simultaneous complete move hints for both players cause a conflict',()=>{
 const dots=[...three.map(p=>({...p,owner:0})),...three.map(p=>({...p,y:8-p.y,owner:1}))],f=screenFixture({positions:initial,installed:[],dots}),r=readSourceContext(f,f.crop,{gap:f.gap});assert.equal(r.turn,null);assert.equal(r.dotEvidence.conflict,true);assert.match(r.turnReason,/충돌/);
});
test('neutral marks and small filled squares are not accepted as colored round hints',()=>{
 for(const color of [[160,160,150,255],[49,212,194,255]]){const {f}=read({targets:[]});for(const p of three)for(let y=24+p.y*58+18;y<=24+p.y*58+30;y++)for(let x=24+p.x*58+18;x<=24+p.x*58+30;x++)f.data.set(color,(y*f.width+x)*4);assert.equal(readSourceContext(f,f.crop,{gap:f.gap}).turn,null);}
});
test('unresolved or illegal walls cannot turn hint pixels into trusted turn evidence',()=>{
 const {f,board}=read();board.wallIssues=['ambiguous'];assert.equal(readSourceContext(f,f.crop,{gap:f.gap,board}).turn,null);
 const invalid=structuredClone(board);invalid.wallIssues=[];invalid.walls=[{type:'wall',o:'h',x:0,y:0,owner:0},{type:'wall',o:'v',x:0,y:0,owner:1}];assert.equal(readSourceContext(f,f.crop,{gap:f.gap,board:invalid}).turn,null);
});
