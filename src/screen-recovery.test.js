import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,legal} from './engine.js';
import {recoverScreenMoves,recoverScreenSequence} from './screen-sync.js';
import {resolveObservedWalls} from './wall-observation.js';
import {recognizeBoard} from './screen-recognition.js';
import {detectBoards,gridFingerprint,retainedGridMatches} from './board-detection.js';
import {screenFixture} from '../scripts/test-fixtures/screen-board.mjs';
const move=(x,y)=>({type:'move',x,y}),wall=(x,y,o='h',owner=0)=>({type:'wall',x,y,o,owner});
test('recover unique three to six skipped plies without altering the source board',()=>{
 const steps=[move(4,7),move(4,1),move(4,6),move(4,2),move(4,5),move(4,3)];
 for(let n=3;n<=6;n++){const s=initial(),target=steps.slice(0,n).reduce(apply,s);assert.deepEqual(recoverScreenMoves(s,target,{maxMs:1000}),steps.slice(0,n));assert.deepEqual(s,initial());}
});
test('ambiguous histories stay blocked, but stable intermediate frames disambiguate them',()=>{
 const s=initial(),steps=[move(4,7),move(4,1),move(5,7)],target=steps.reduce(apply,s);
 assert.throws(()=>recoverScreenMoves(s,target,{maxMs:1000}),/여러 개/);
 assert.deepEqual(recoverScreenSequence(s,target,[apply(s,steps[0]),target]),steps);
 assert.throws(()=>recoverScreenMoves(s,target,{maxNodes:0}),/한도/);
});
test('recovery includes newly placed walls and rejects resource mismatch and removal',()=>{
 const s=initial(),steps=[move(4,7),wall(1,1,'v',1),move(4,6),wall(6,4,'h',1)],target=steps.reduce(apply,s);
 assert.throws(()=>recoverScreenMoves(s,target,{maxMs:1000}),/여러 개/); // opponent walls can be placed in either order
 const first=steps.slice(0,2).reduce(apply,s);assert.deepEqual(recoverScreenSequence(s,target,[first,target]),steps.map(({owner,...a})=>a));
 assert.throws(()=>recoverScreenMoves(target,s),/벽 삭제/);
 assert.throws(()=>recoverScreenMoves(s,{...apply(s,move(4,7)),left:[9,10]},{maxNodes:100}),/한도|복원/);
});
test('connected same-color walls do not create sliding duplicate walls',()=>{
 const a=wall(0,2),b=wall(2,2),fake=wall(1,2);const result=resolveObservedWalls([a,fake,b,a]);assert.deepEqual(result.walls,[a,b]);assert.deepEqual(result.issues,[]);
 const ambiguous=resolveObservedWalls([a,fake]);assert.ok(ambiguous.issues.length);
 assert.deepEqual(resolveObservedWalls([a,fake],[a]).walls,[a]);
});
test('dense twenty-wall bitmap conserves both players stocks despite filled joins',()=>{
 const installed=[];for(const [row,owner]of[[0,0],[2,1],[4,0],[6,1]])for(const x of [0,2,4,6])installed.push(wall(x,row,'h',owner));for(const x of [0,2,4,6])installed.push(wall(x,7,'h',x<4?0:1));
 let check=initial();for(const a of installed){check.turn=a.owner;assert.ok(legal(check,a));check=apply(check,a);}
 const f=screenFixture({installed});for(const y of [0,2,4,6,7])for(const x of [1,3,5]){
  if(y===7&&x===3)continue;const owner=installed.find(w=>w.y===y&&w.x===x-1).owner,c=owner===0?[49,212,194,255]:[250,115,147,255];
  for(let yy=24+y*58+50;yy<24+y*58+56;yy++)for(let xx=24+(x+1)*58-10;xx<24+(x+1)*58;xx++)f.data.set(c,(yy*f.width+xx)*4);
 }
 const [grid]=detectBoards(f),r=recognizeBoard(f,grid.rect,{gap:grid.gap});assert.ok(r.rawWallCount>installed.length);assert.equal(r.walls.length,20);assert.deepEqual(r.wallIssues,[]);assert.deepEqual([0,1].map(t=>10-r.walls.filter(w=>w.owner===t).length),[0,0]);
});
test('confirmed grid fingerprint tolerates changed pawns but rejects a missing board',()=>{
 const f=screenFixture(),[grid]=detectBoards(f),previous={...grid,width:f.width,height:f.height,fingerprint:gridFingerprint(f,grid)};
 assert.equal(retainedGridMatches(screenFixture({positions:[{x:3,y:5},{x:6,y:3}]}),previous),true);
 const fragmented=screenFixture({fragmentTiles:true});assert.equal(detectBoards(fragmented).length,0);assert.equal(retainedGridMatches(fragmented,previous),true);assert.deepEqual(recognizeBoard(fragmented,grid.rect,{gap:grid.gap}).p,f.expected.p);
 const empty=screenFixture();empty.data.fill(0);assert.equal(retainedGridMatches(empty,previous),false);
 assert.equal(retainedGridMatches({...f,width:561},previous),false);
});
