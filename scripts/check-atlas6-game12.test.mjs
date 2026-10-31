import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {legal} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-openings.json','utf8'));
test('Atlas 6 returns legal complete decisions on Game12 danger positions at 500ms',async()=>{
 const service=createAtlas6Service();
 try{
  for(const ply of [13,17,19,21]){
   const state=fixtures.find(f=>f.id==='game12-ply'+ply).state;
   const r=await service.client.search(state,{ms:500,cores:4});
   assert.ok(r.depth>=1,'completed depth '+ply);
   assert.ok(legal(state,r.pv[0]),'illegal action '+ply);
   assert.ok(r.elapsedMs<=560,'over budget '+ply+': '+r.elapsedMs);
   console.log('Game12',ply,r.depth,r.nodes,r.elapsedMs,r.pv[0]);
  }
 }finally{await service.close();}
});
