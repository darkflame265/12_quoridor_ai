import test from 'node:test';
import assert from 'node:assert/strict';
import {recognizeBoard} from '../../src/capture/screen-recognition.js';
import {checkedSnapshot,snapshotFromDraft,snapshotIssues,restoreObservedSession} from '../../src/capture/observed-state.js';
import {screenFixture} from '../fixtures/screen-board.mjs';
import {initial,apply} from '../../src/game/engine.js';
import {positionKey,replayRecords} from '../../src/ai/spectator.js';
const wallKey=w=>`${w.o}:${w.x}:${w.y}:${w.owner}`;
test('pixel reader distinguishes solid/ring pawns, dots, neighboring walls and neutral preview at multiple scales',()=>{
 for(const scale of [1,2])for(const ring of [false,true]){
  const f=screenFixture({scale,ring}),r=recognizeBoard(f,f.crop,{gap:f.gap});assert.deepEqual(r.p,f.expected.p);assert.deepEqual(r.walls.map(wallKey).sort(),f.expected.walls.map(wallKey).sort());assert.equal(r.notes.length,0);
 }
});
test('unreadable pawn candidates remain unresolved rather than inventing a position',()=>{
 const f=screenFixture();f.data.fill(0);const r=recognizeBoard(f,f.crop,{gap:f.gap});assert.deepEqual(r.p,[null,null]);assert.equal(r.notes.length,2);assert.ok(snapshotIssues(snapshotFromDraft(r)).length>0);
});
test('crop bounds and spacing are validated before reading',()=>{
 const f=screenFixture();assert.throws(()=>recognizeBoard(f,{...f.crop,x:-1}));assert.throws(()=>recognizeBoard(f,f.crop,{gap:0}));assert.throws(()=>recognizeBoard(f,{...f.crop,width:5}));
});
test('pink-bottom source rotates pawn positions and wall anchors, preserving owners and resources',()=>{
 const f=screenFixture(),draft=recognizeBoard(f,f.crop,{gap:f.gap}),s=checkedSnapshot(snapshotFromDraft(draft,{bottom:1,turn:1,left:[8,9]}));assert.deepEqual(s.p,[{x:4,y:2},{x:4,y:6}]);assert.ok(s.walls.some(w=>w.x===6&&w.y===4&&w.o==='h'&&w.owner===0));assert.deepEqual(s.left,[8,9]);
});
test('static snapshot validation rejects overlaps, crossings, same-square pieces and stock mismatch',()=>{
 const s=screenFixture().expected;assert.doesNotThrow(()=>checkedSnapshot(s));
 const duplicate=structuredClone(s);duplicate.walls.push({...duplicate.walls[0]});duplicate.left[0]--;assert.throws(()=>checkedSnapshot(duplicate));
 const crossing=structuredClone(s);crossing.walls.push({...crossing.walls[0],o:'v'});crossing.left[0]--;assert.throws(()=>checkedSnapshot(crossing));
 const same=structuredClone(s);same.p[1]={...same.p[0]};assert.throws(()=>checkedSnapshot(same));
 const stock=structuredClone(s);stock.left[0]++;assert.throws(()=>checkedSnapshot(stock));
});
test('closed goal routes are rejected even if wall counts match',()=>{
 const s=initial();s.p[0]={x:0,y:8};s.walls=[{type:'wall',o:'h',x:0,y:7,owner:0},{type:'wall',o:'v',x:1,y:7,owner:1}];s.left=[9,9];assert.throws(()=>checkedSnapshot(s));
});
test('observed base plus later actions survive save/restore; old replay format is unchanged',()=>{
 const base=screenFixture().expected,action={type:'move',x:5,y:2},r=restoreObservedSession({version:3,baseState:base,records:[action]});assert.equal(positionKey(r.state),positionKey(apply(base,action)));assert.equal(positionKey(r.past[0]),positionKey(base));assert.equal(r.records.length,1);
 const old={version:2,records:[{type:'move',x:4,y:7}]};assert.deepEqual(restoreObservedSession(old).state,replayRecords(old).state);assert.equal(restoreObservedSession(old).baseState,null);
 assert.throws(()=>restoreObservedSession({baseState:base,records:[{type:'move',x:0,y:0}]}));
});
test('goal state derives winner and does not accept contradictory game-over metadata',()=>{
 const draft={p:[{x:4,y:0},{x:4,y:3}],walls:[]},s=snapshotFromDraft(draft,{turn:0});assert.equal(s.winner,0);assert.equal(s.turn,1);assert.doesNotThrow(()=>checkedSnapshot(s));assert.throws(()=>checkedSnapshot({...s,winner:null}));
});
