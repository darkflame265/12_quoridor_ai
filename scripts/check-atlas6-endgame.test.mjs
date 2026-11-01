import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {apply,legal} from '../src/engine.js';
const fixture=JSON.parse(readFileSync('evaluation/atlas6-endgame-fixtures.json','utf8'))[0];
test('One remaining wall produces an exact mirrored proof when given a sufficient budget',async()=>{
 const service=createAtlas6Service();
 try{
  const a=await service.client.search(fixture.state,{ms:1000,cores:4});
  assert.equal(a.exact,true,'one-wall proof was not completed');
  assert.ok(a.elapsedMs<=1000,'one-wall proof exceeded budget');
  assert.ok(legal(fixture.state,a.pv[0]),'one-wall best move is illegal');
  const successor=apply(fixture.state,a.pv[0]);
  assert.deepEqual(successor.left,[0,0],'this fixture should spend the final wall');
  const b=await service.client.search(successor,{ms:500,cores:4});
  assert.equal(b.exact,true,'zero-wall proof was not completed');
  assert.equal(a.score,-b.score-1,'parent and exact child proof values disagree');
  const mirrored=structuredClone(fixture.state);
  mirrored.p=mirrored.p.map(p=>({...p,x:8-p.x}));
  mirrored.walls=mirrored.walls.map(w=>({...w,x:7-w.x}));
  const reflected=await service.client.search(mirrored,{ms:1000,cores:4});
  assert.equal(reflected.exact,true,'mirrored one-wall proof incomplete');
  assert.equal(reflected.score,a.score,'horizontal reflection changed exact WDL/DTM');
  assert.ok(legal(mirrored,reflected.pv[0]));
  console.log(JSON.stringify({oneWallMs:a.elapsedMs,mirrorMs:reflected.elapsedMs,score:a.score}));
 }finally{await service.close();}
});

test('one-wall position returns a legal decision inside the 500ms budget even if proof aborts',async()=>{
 const service=createAtlas6Service();
 try{
  const r=await service.client.search(fixture.state,{ms:500,cores:4});
  assert.ok(legal(fixture.state,r.pv[0]));
  assert.ok(r.elapsedMs<=520);
 }finally{await service.close();}
});
