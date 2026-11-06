import test from 'node:test';
import assert from 'node:assert/strict';
import {automaticResyncSnapshot} from '../../src/capture/screen-resync.js';
import {recognizeBoard} from '../../src/capture/screen-recognition.js';
import {detectBoards} from '../../src/capture/board-detection.js';
import {screenFixture} from '../fixtures/screen-board.mjs';
const input=()=>{const f=screenFixture(),[g]=detectBoards(f);return {draft:recognizeBoard(f,g.rect,{gap:g.gap}),source:{bottom:0,relative:'self'},automaticGrid:true,autoSide:true,autoTurn:true};};
test('fresh automatic board applies current turn and inferred wall stocks',()=>{
 const data=input(),s=automaticResyncSnapshot(data);assert.equal(s.turn,0);assert.equal(s.walls.length,3);assert.deepEqual(s.left,[8,9]);
 const opponent=automaticResyncSnapshot({...data,source:{bottom:0,relative:'opponent'}});assert.equal(opponent.turn,1);
});
test('uncertain grid, manual context, missing turn, and wall ambiguities require review',()=>{
 for(const overrides of [{automaticGrid:false},{draft:null},{autoSide:false},{autoTurn:false},{source:{bottom:null,relative:'self'}},{source:{bottom:0,relative:null}}])assert.throws(()=>automaticResyncSnapshot({...input(),...overrides}));
 for(const field of ['notes','wallIssues']){const data=input();data.draft[field]=['uncertain'];assert.throws(()=>automaticResyncSnapshot(data));}
 const data=input();data.draft.p[0]=null;assert.throws(()=>automaticResyncSnapshot(data));
});
