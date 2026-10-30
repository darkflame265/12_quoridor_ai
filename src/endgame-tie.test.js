import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {solveEndgame,decode} from './search.js';
import {apply,legal,moves,distance} from './engine.js';
const game=JSON.parse(fs.readFileSync(new URL('../evaluation/fixtures/game9-record.json',import.meta.url),'utf8'));
test('game9 exact losing choices preserve outcome and distance and break ties toward the goal',()=>{
 let s=game.baseState;
 for(let i=0;i<63;i++){
  if([56,58,60,62].includes(i)){
   const table=solveEndgame(s),r=table.lookup(s.p[0].y*9+s.p[0].x,s.p[1].y*9+s.p[1].x,s.turn),a=decode(r.move),n=apply(s,a);
   assert.ok(legal(s,a));assert.equal(r.outcome,-1);assert.equal(r.distance,64-i);
   const child=table.lookup(n.p[0].y*9+n.p[0].x,n.p[1].y*9+n.p[1].x,n.turn);
   assert.equal(child.outcome,1);assert.equal(child.distance+1,r.distance);
   const equivalent=moves(s).filter(a=>{const q=apply(s,a),v=table.lookup(q.p[0].y*9+q.p[0].x,q.p[1].y*9+q.p[1].x,q.turn);return v.outcome===1&&v.distance+1===r.distance;});
   assert.equal(distance(n,0),Math.min(...equivalent.map(a=>distance(apply(s,a),0))));
  }
  s=apply(s,game.records[i]);
 }
});
test('a winning race keeps its shortest winning distance',()=>{
 const s={p:[{x:4,y:6},{x:0,y:0}],walls:[],left:[0,0],turn:0,winner:null},table=solveEndgame(s),r=table.lookup(58,0,0);
 assert.equal(r.outcome,1);assert.equal(r.distance,11);
 const n=apply(s,decode(r.move)),child=table.lookup(n.p[0].y*9+n.p[0].x,n.p[1].y*9+n.p[1].x,n.turn);
 assert.equal(child.outcome,-1);assert.equal(child.distance+1,11);
});
