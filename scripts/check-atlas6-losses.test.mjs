import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {legal} from '../src/engine.js';
const cases=[
 ['game11', 'reports/game11-loss/trace.json',[12,20,28]],
 ['game12', 'reports/game12-loss/trace.json',[13,17,19,21]],
];
test('Atlas 6 legal moves on varied historical loss positions at 500ms',async()=>{
 const service=createAtlas6Service();
 try{
  for(const [name,file,plies] of cases){
   const trace=JSON.parse(readFileSync(file,'utf8'));
   for(const ply of plies){
    const row=trace.rows.find(r=>r.ply===ply);
    assert.ok(row?.state,name+' missing state '+ply);
    const r=await service.client.search(row.state,{ms:500,cores:4});
    assert.ok(r.depth>=1,name+' zero completed depth '+ply);
    assert.ok(legal(row.state,r.pv[0]),name+' illegal decision '+ply);
    assert.ok(r.elapsedMs<560,name+' timed out '+ply);
    console.log(name,ply,r.depth,Math.round(r.elapsedMs),JSON.stringify(r.pv[0]));
   }
  }
 }finally{await service.close();}
});
