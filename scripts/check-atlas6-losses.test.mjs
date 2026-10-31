import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {legal} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-openings.json','utf8'));
test('Atlas 6 legal moves on independently stored loss positions at 500ms',async()=>{
 const service=createAtlas6Service();
 try{
  for(const id of ['game11-ply12','game11-ply20','game11-ply28','game12-ply13','game12-ply17','game12-ply19','game12-ply21']){
   const position=fixtures.find(f=>f.id===id)?.state;
   assert.ok(position,id+' fixture missing');
   const r=await service.client.search(position,{ms:500,cores:4});
   assert.ok(r.depth>=1,id+' incomplete');
   assert.ok(legal(position,r.pv[0]),id+' illegal');
   assert.ok(r.elapsedMs<=560,id+' time budget');
   console.log(id,r.depth,Math.round(r.elapsedMs),r.pv[0]);
  }
 }finally{await service.close();}
});
