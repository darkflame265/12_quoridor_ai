import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {apply} from './engine.js';
import {solveEndgame} from './search.js';
import {solveOneEnemyWall} from '../evaluation/one-wall-oracle.mjs';
const game=JSON.parse(fs.readFileSync(new URL('../evaluation/fixtures/game8-record.json',import.meta.url),'utf8'));
let state=game.baseState;for(const a of game.records.slice(0,40))state=apply(state,a);
const index=p=>p.y*9+p.x;
test('no-enemy-wall case agrees with the existing fixed-maze oracle for every distinct pawn pair and turn',()=>{
 const s={...state,left:[0,0]},one=solveOneEnemyWall(s,0),fixed=solveEndgame(s);
 for(let a=0;a<81;a++)for(let b=0;b<81;b++)if(a!==b)for(const t of [0,1])assert.equal(one.lookup(a,b,t),fixed.lookup(a,b,t).outcome);
});
test('game 8 retreat loses even against one delayed wall; forward alternative only survives the restricted game',()=>{
 const before=structuredClone(state),one=solveOneEnemyWall(state,0),fixed=solveEndgame(state);
 const retreat=apply(state,{type:'move',x:4,y:5}),forward=apply(state,{type:'move',x:3,y:4});
 assert.equal(-one.lookup(index(retreat.p[0]),index(retreat.p[1]),retreat.turn),-1);
 assert.equal(-one.lookup(index(forward.p[0]),index(forward.p[1]),forward.turn),1);
 for(let a=0;a<81;a++)for(let b=0;b<81;b++)if(a!==b)for(const t of [0,1]){
  const sign=t===0?1:-1;
  assert.ok(sign*one.lookup(a,b,t)<=sign*fixed.lookup(a,b,t).outcome,'giving the enemy a wall must not improve the target outcome');
 }
 assert.deepEqual(state,before);
});
test('one-wall outcomes preserve player/board rotation symmetry and reject a target with walls',()=>{
 const rotated={...state,p:[state.p[1],state.p[0]].map(p=>({x:8-p.x,y:8-p.y})),walls:state.walls.map(w=>({...w,x:7-w.x,y:7-w.y,owner:1-w.owner})),left:[state.left[1],state.left[0]],turn:1-state.turn};
 const a=solveOneEnemyWall(state,0),b=solveOneEnemyWall(rotated,1);
 assert.equal(a.lookup(index(state.p[0]),index(state.p[1]),state.turn),b.lookup(index(rotated.p[0]),index(rotated.p[1]),rotated.turn));
 assert.throws(()=>solveOneEnemyWall({...state,left:[1,6]},0));
});
