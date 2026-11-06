import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply} from './engine.js';
import {reconcileScreenFrame as frame} from './screen-transition.js';
const move=(x,y)=>({type:'move',x,y});
const counter={logicalCount:12,confirmedCount:12};

test('either own color advances by one legal move even without opponent-turn captions',()=>{
 for(const turn of [0,1]){
  const before={...initial(),turn},action=move(4,turn===0?7:1),target=apply(before,action);
  const r=frame(before,target,[],{...counter,sourceCount:12});
  assert.deepEqual(r.actions,[action]);assert.equal(r.next.turn,1-turn);
  assert.equal(r.ready,false);assert.equal(r.immediate,false);assert.equal(r.logicalCount,13);assert.equal(r.confirmedCount,12);
 }
});
test('old turn labels and zero counter delta cannot block a uniquely observed move',()=>{
 const s=initial(),a=move(4,7),r=frame(s,apply(s,a),[],{...counter,sourceTurn:0,sourceCount:12});
 assert.deepEqual(r.actions,[a]);assert.equal(r.ready,false);
 const caughtUp=frame(r.next,r.next,[],{logicalCount:r.logicalCount,confirmedCount:r.confirmedCount,sourceCount:13});
 assert.deepEqual(caughtUp.actions,[]);assert.equal(caughtUp.ready,true);assert.equal(caughtUp.confirmedCount,13);
 const duplicate=frame(r.next,r.next,[],{logicalCount:13,confirmedCount:12,sourceCount:12});
 assert.deepEqual(duplicate.actions,[]);assert.equal(duplicate.logicalCount,13);
});
test('wall placement uses the same immediate board path with exact owner and stock',()=>{
 const s=initial(),a={type:'wall',x:2,y:3,o:'h'},target=apply(s,a);
 const r=frame(s,target,[],{...counter,sourceCount:12,turnConflict:true});
 assert.deepEqual(r.actions,[a]);assert.deepEqual(r.next.left,[9,10]);assert.equal(r.ready,false);
 assert.throws(()=>frame(s,{...target,left:[10,10]},[],counter));
});
test('caption-independent counting keeps two fast moves and later OCR catch-up consistent',()=>{
 const s=initial(),a=move(4,7),b=move(4,1),one=frame(s,apply(s,a),[],{...counter,sourceCount:12});
 const two=frame(one.next,apply(one.next,b),[],{logicalCount:13,confirmedCount:12,sourceCount:12,sourceTurn:0});
 assert.deepEqual(two.actions,[b]);assert.equal(two.logicalCount,14);assert.equal(two.ready,true);
 const caughtUp=frame(two.next,two.next,[],{logicalCount:14,confirmedCount:12,sourceCount:14,sourceTurn:0});
 assert.deepEqual(caughtUp.actions,[]);assert.equal(caughtUp.confirmedCount,14);
 const skipped=frame(s,apply(apply(s,a),b),[],{...counter,sourceCount:14,sourceTurn:0});
 assert.deepEqual(skipped.actions,[a,b]);assert.equal(skipped.immediate,true);
});
test('real evidence conflicts hold advice; a fresh matching turn can tolerate a slow counter',()=>{
 const s=initial(),target=apply(s,move(4,7));
 assert.equal(frame(s,target,[],{...counter,sourceCount:12,sourceTurn:1}).ready,true);
 assert.equal(frame(s,target,[],{...counter,sourceCount:13,turnConflict:true}).ready,false);
 assert.equal(frame(s,target,[],{...counter,sourceCount:13,sourceTurn:0}).ready,false);
});
test('counter ahead, genuine rollback, illegal teleport and disappeared walls still reject',()=>{
 const s=initial(),target=apply(s,move(4,7));
 assert.throws(()=>frame(s,target,[],{...counter,sourceCount:14}));
 assert.throws(()=>frame(s,target,[],{...counter,sourceCount:11}));
 assert.throws(()=>frame(s,{...s,p:[{x:0,y:0},s.p[1]]},[],counter));
 const w=apply(s,{type:'wall',x:1,y:1,o:'v'});assert.throws(()=>frame(w,s,[],counter));
});
