import test from 'node:test';
import assert from 'node:assert/strict';
import {orientPosition,orientAction,viewFlipped} from './view.js';
import {initial,moves,validWall,apply} from './engine.js';
test('either player can start at top or bottom with forward moves oriented correctly',()=>{
  const s=initial();
  for(const side of [0,1])for(const position of ['top','bottom']){
    const flip=viewFlipped(side,position),row=position==='top'?0:8;
    assert.deepEqual(orientPosition(s.p[side],flip),{x:4,y:row});
    assert.deepEqual(orientPosition(s.p[1-side],flip),{x:4,y:8-row});
    const forward=moves(s,side).find(m=>m.x===4);
    assert.equal(orientAction(forward,flip).y,position==='top'?1:7);
  }
});
test('every square and wall anchor round trips without changing orientation or owner',()=>{
  for(const type of ['move','wall'])for(let y=0;y<(type==='wall'?8:9);y++)for(let x=0;x<(type==='wall'?8:9);x++)for(const o of ['h','v']){
    const a={type,x,y,o,owner:1};
    assert.deepEqual(orientAction(orientAction(a,true),true),a);
    assert.deepEqual(orientAction(a,false),a);
  }
});
test('rotated screen wall converts to legal engine wall and renders at same anchor',()=>{
  for(const o of ['h','v']){
    const s=initial();s.turn=1;
    const screen={type:'wall',x:1,y:6,o};
    const actual=orientAction(screen,true);
    assert(validWall(s,actual));
    const after=apply(s,actual);
    const shown=orientAction(after.walls[0],true);
    assert.equal(shown.x,screen.x);assert.equal(shown.y,screen.y);assert.equal(shown.o,o);assert.equal(shown.owner,1);
  }
});
