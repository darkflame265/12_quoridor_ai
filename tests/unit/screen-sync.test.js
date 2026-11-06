import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply} from '../../src/game/engine.js';
import {inferScreenMoves,StableScreenBoard,boardKey} from '../../src/capture/screen-sync.js';
const move=(x,y)=>({type:'move',x,y}),wall=(x,y,o='h')=>({type:'wall',x,y,o});
test('live sync infers one move and two fast plies without trusting observed turn',()=>{
 const start=initial(),a=move(4,7),b=move(4,1),one=apply(start,a),two=apply(one,b);
 assert.deepEqual(inferScreenMoves(start,{...one,turn:0}),[a]);
 assert.deepEqual(inferScreenMoves(start,{...two,turn:1}),[a,b]);
 assert.deepEqual(inferScreenMoves(two,two),[]);
});
test('live sync records wall owner and stock with mixed and double-wall plies',()=>{
 const start=initial(),a=wall(2,2),b=move(4,1),c=wall(5,4,'v');
 assert.deepEqual(inferScreenMoves(start,apply(apply(start,a),b)),[a,b]);
 const two=apply(apply(start,a),c);two.walls.reverse();
 assert.deepEqual(inferScreenMoves(start,two),[a,c]);
 assert.equal(boardKey(two),boardKey({...two,walls:[...two.walls].reverse()}));
});
test('live sync supports straight jump, diagonal jump and terminal move',()=>{
 const s={...initial(),p:[{x:4,y:4},{x:4,y:3}]};
 const jump=move(4,2);assert.deepEqual(inferScreenMoves(s,apply(s,jump)),[jump]);
 const blocked={...s,walls:[{...wall(4,2),owner:1}],left:[10,9]},diagonal=move(3,3);
 assert.deepEqual(inferScreenMoves(blocked,apply(blocked,diagonal)),[diagonal]);
 const end={...initial(),p:[{x:4,y:1},{x:0,y:4}]},finish=move(4,0);
 assert.deepEqual(inferScreenMoves(end,apply(end,finish)),[finish]);
});
test('live sync rejects wrong turn, teleport, removal, stock mismatch and excess plies',()=>{
 const s=initial();
 assert.throws(()=>inferScreenMoves(s,{...s,p:[s.p[0],{x:4,y:1}]}));
 assert.throws(()=>inferScreenMoves(s,{...s,p:[{x:4,y:5},s.p[1]]}));
 assert.throws(()=>inferScreenMoves(s,{...apply(s,move(4,7)),left:[9,10]}));
 const placed=apply(s,wall(1,1));assert.throws(()=>inferScreenMoves(placed,s));
 assert.throws(()=>inferScreenMoves(s,apply(apply(apply(s,move(4,7)),move(4,1)),move(4,6))));
 assert.deepEqual(s,initial());
});
test('stable frames require consecutive agreement and reset after uncertainty',()=>{
 const gate=new StableScreenBoard(3),s=initial(),next=apply(s,move(4,7));
 assert.equal(gate.observe(s),false);assert.equal(gate.observe(s),false);
 assert.equal(gate.observe(next),false);assert.equal(gate.observe(s),false);
 assert.equal(gate.observe(s),false);assert.equal(gate.observe(s),true);
 gate.reset();assert.equal(gate.observe(s),false);
});
