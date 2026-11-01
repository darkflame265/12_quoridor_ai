import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {legal} from '../src/engine.js';
const fixture=JSON.parse(readFileSync('evaluation/atlas6-openings.json','utf8'))[0].state;
test('Atlas6 cancellation rejects the request and leaves the service reusable',async()=>{
 const service=createAtlas6Service();
 try{
  await service.client.health();
  const id='atlas6-cancel-smoke';
  const search=service.client.search(fixture,{id,ms:3000,cores:4});
  await new Promise(resolve=>setTimeout(resolve,30));
  const healthStart=performance.now();
  await service.client.health();
  assert.ok(performance.now()-healthStart<700,'health should respond during a long search');
  service.client.cancel(id);
  await assert.rejects(search,err=>err.name==='AbortError');
  const r=await service.client.search(fixture,{ms:500,cores:4});
  assert.ok(legal(fixture,r.pv[0]),'engine failed after cancellation');
  assert.ok(r.elapsedMs<=560,'engine exceeded normal budget after cancellation');
 }finally{await service.close();}
});
