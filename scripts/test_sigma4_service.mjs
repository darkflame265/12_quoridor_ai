import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createSigma4Service} from '../server/sigma4-service.mjs';
import {initial,legal} from '../src/engine.js';
import {normalizeSessionSettings} from '../src/session-settings.js';

assert.equal(normalizeSessionSettings({engine:'sigma2'},{startup:true}).engine,'sigma4');
assert.equal(normalizeSessionSettings({engine:'sigma3'}).engine,'sigma3');
assert.equal(normalizeSessionSettings({engine:'sigma4'}).engine,'sigma4');
const service=createSigma4Service();
try{
 await service.client.health();
 await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(0,'127.0.0.1',resolve);});
 const port=service.server.address().port,base='http://127.0.0.1:'+port;
 const health=await fetch(base+'/health');
 assert.equal(health.status,200);
 const info=await health.json();
 assert.equal(info.engineInfo.id,'sigma4');
 assert.equal(info.engine,'sigma4');
 const state=initial();
 const search=await fetch(base+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
  id:randomUUID(),session:'sigma4-integration-test',state,ms:30000,cores:1
 })});
 assert.equal(search.status,200);
 const lines=(await search.text()).trim().split('\n').map(line=>JSON.parse(line));
 const result=lines.at(-1);
 assert.equal(result.done,true);
 assert.ok(!result.error,JSON.stringify(result.error));
 assert.ok(result.pv?.length>0);
 assert.ok(legal(state,result.pv[0]),'Sigma4 recommended action must be legal');
 assert.equal(result.sigma4?.policy,'bounded-3ply-tactical-q-visit');
 assert.ok(result.sigma4?.reason);
 console.log('PASS Sigma4 native API: health, 200-sim root, legal action, policy diagnostics, default session Sigma4',JSON.stringify({
  action:result.pv[0],reason:result.sigma4.reason,
  simulations:result.simulations,elapsedMs:result.elapsedMs
 }));
}finally{await service.close();}
