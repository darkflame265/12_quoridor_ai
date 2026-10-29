import assert from 'node:assert/strict';
import {createPressureService} from '../server/pressure-service.mjs';
import {initial,legal} from '../src/engine.js';
const service=createPressureService();
try{await service.client.health();await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${service.server.address().port}`;
 const health=await(await fetch(base+'/health')).json();assert.equal(health.engineInfo.id,'atlas-pressure');assert.equal(health.engineInfo.promoted,false);
 const r=await fetch(base+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'pressure-http',session:'qa',state:initial(),ms:120,cores:2})});assert.ok(r.ok);const events=(await r.text()).trim().split('\n').map(JSON.parse),done=events.at(-1);assert.equal(done.done,true);assert.ok(legal(initial(),done.pv[0]));assert.match(done.engine,/immediate pressure/);assert.ok(done.pressure);console.log(JSON.stringify({health:health.engineInfo,legalResult:true,progressEvents:events.length-1,explicitPressureEngine:true}));
}finally{await service.close();}
