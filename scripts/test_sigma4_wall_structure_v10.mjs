import assert from 'node:assert/strict';
import {initial,apply,legal,moves,validWall} from '../src/engine.js';
import {chooseSigma4WallStructureV10,evaluateWallStructure} from './sigma4-wall-structure-v10.mjs';

const s0=initial();
const line=[{type:'move',x:4,y:7},{type:'move',x:4,y:1},
 {type:'move',x:4,y:6},{type:'move',x:4,y:2}];
let state=s0;
for(const a of line){assert(legal(state,a));state=apply(state,a);}
const good={type:'wall',x:3,y:6,o:'h'};
const bad={type:'wall',x:3,y:0,o:'h'};
assert(legal(state,good)&&legal(state,bad));
const g=evaluateWallStructure(state,good),b=evaluateWallStructure(state,bad);
assert(g.score-b.score>=3,'expected large path cut contrast');
assert.equal(g.ownDetour,0);
assert(g.opponentDetour>0);
assert.equal(b.opponentDetour,0);
assert(b.ownDetour>0);
const makeRoot=(nativeQ,weightedQ)=>({pv:[good],elapsedMs:200,diagnostics:{rootChildren:[
 {action:bad,visits:70,qFromRoot:weightedQ},
 {action:good,visits:80,qFromRoot:nativeQ}
]}});
const options={rate:1,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:1,minVisitRatio:0};
const fixed=chooseSigma4WallStructureV10(state,makeRoot(.32,.30),()=>0,{...options,wallScoreMargin:1});
assert.equal(fixed.wallV10,'replaced');
assert.deepEqual(fixed.action,good);
assert.deepEqual(fixed.priorAction,bad);
const noQ=chooseSigma4WallStructureV10(state,makeRoot(.27,.3),()=>0,{...options,wallScoreMargin:1});
assert.equal(noQ.wallV10,'native-q-not-better');
assert.deepEqual(noQ.action,bad);
const highMargin=chooseSigma4WallStructureV10(state,makeRoot(.32,.3),()=>0,{...options,wallScoreMargin:10});
assert.equal(highMargin.wallV10,'retained');
assert.deepEqual(highMargin.action,bad);
const noSampling=chooseSigma4WallStructureV10(state,makeRoot(.32,.30),()=>.999,options);
assert.equal(noSampling.wallV10,'no-comparable-sample');
assert.deepEqual(noSampling.action,good);
// Validate determinism, finite scores and non-mutation on fresh legal wall-heavy states.
let seed=217711;
const random=()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return (seed>>>0)/4294967296;};
let samples=0;
for(let game=0;game<12;game++){
 let board=initial();
 for(let ply=0;ply<18&&board.winner===null;ply++){
  const validWalls=[];
  if(board.left[board.turn]>0)for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
   const a={type:'wall',x,y,o};if(validWall(board,a))validWalls.push(a);
  }
  if(validWalls.length){
   const before=JSON.stringify(board);
   for(const i of [0,Math.floor(validWalls.length/2),validWalls.length-1]){
    const a=validWalls[i],one=evaluateWallStructure(board,a),two=evaluateWallStructure(board,a);
    assert.deepEqual(one,two);
    assert(Number.isFinite(one.score)&&Number.isFinite(one.persistentDetour));
    assert.equal(JSON.stringify(board),before,'evaluation mutated board');
    samples++;
   }
  }
  const pawns=moves(board),walls=validWalls;
  const pool=walls.length&&random()<.56?walls:pawns;
  const action=pool[Math.floor(random()*pool.length)];
  if(!action)break;
  assert(legal(board,action));
  board=apply(board,action);
 }
}
assert(samples>=150);
console.log('PASS randomized wall evaluation non-mutation',samples);
console.log('PASS wall structure V10',JSON.stringify({good:g,bad:b,selected:fixed.wallV10,skip:noSampling.wallV10}));
