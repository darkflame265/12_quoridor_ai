import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {apply} from '../../src/game/engine.js';
import {wallRun,wallStreak} from '../../src/game/wall-streak.js';
const game=JSON.parse(fs.readFileSync(new URL('../fixtures/game8-record.json',import.meta.url),'utf8'));
test('observed consecutive walls carry per-turn progress opportunities and reset on own movement',()=>{
 let state=game.baseState;const past=[];
 for(let i=0;i<game.records.length;i++){
  const run=wallRun(game.records.slice(0,i),past,state.turn,0);
  assert.equal(run.length,wallStreak(game.records.slice(0,i),state.turn,0));
  if(i===24){assert.equal(run.length,8);assert.ok(run.every(a=>a.moveProgress>=1));}
  if(i===26)assert.equal(run.length,0);
  past.push(state);state=apply(state,game.records[i]);
 }
 assert.deepEqual(wallRun([],[],0,0),[]);
 assert.equal(wallRun([{type:'wall',x:1,y:1,o:'h'}],[],1,1)[0].moveProgress,0,'missing past must not invent an opportunity');
});
