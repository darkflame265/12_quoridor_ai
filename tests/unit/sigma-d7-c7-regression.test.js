import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,legal,distance} from '../../src/game/engine.js';
// First 30 top-level records of uploaded quoridor-game (14).json.
// ScreenSegments are deliberately NOT used; this is the actual user-reported replay.
const raw='m4,7 m4,1 m4,6 m4,2 m4,5 m4,3 v4,3 h0,1 v4,5 h2,1 v3,2 h4,2 h3,4 h3,5 v2,3 m4,4 h1,4 m3,4 v1,2 m3,3 v0,3 m3,2 v1,5 m2,2 m3,5 m3,2 m2,5 m2,2 m2,6 m2,3'.split(' ');
const a=t=>t[0]==='m'?{type:'move',x:+t[1],y:+t[3]}:{type:'wall',o:t[0],x:+t[1],y:+t[3]};
test('uploaded top-level 20-30 moves reconstruct d7-c7-d7-c7 oscillation legally',()=>{
 let s=initial();const states=[];
 for(const [i,token] of raw.entries()){const action=a(token);assert.ok(legal(s,action),'ply '+(i+1));states.push(structuredClone(s));s=apply(s,action);}
 assert.deepEqual([21,23,25,27,29].map(i=>a(raw[i])),[
  {type:'move',x:3,y:2},{type:'move',x:2,y:2},{type:'move',x:3,y:2},{type:'move',x:2,y:2},{type:'move',x:2,y:3}
 ]);
 // Repetition is of pawn squares, not necessarily identical full-board states:
 // opponent's walls changed between ply 22 and 24.
 assert.ok(states[25].p[1].x===2&&states[25].p[1].y===2);
 assert.ok(distance(states[25],1)>=0);
});
