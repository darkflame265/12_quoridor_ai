import assert from 'node:assert/strict';import {writeFile,mkdir} from 'node:fs/promises';
import {createSigmaService} from '../../server/sigma-service.mjs';import {createSigma4Service} from '../../server/sigma4-service.mjs';import {initial,legal} from '../../src/game/engine.js';
const results=[];
for(const id of ['sigma2','sigma3','sigma4']){
 const service=id==='sigma4'?createSigma4Service():createSigmaService(id);
 try{await service.client.health();await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(0,'127.0.0.1',resolve);});
  const url='http://127.0.0.1:'+service.server.address().port,info=await(await fetch(url+'/health')).json();assert.equal(info.engineInfo.id,id);
  const state=initial(),response=await fetch(url+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'cleanup-'+id,session:'cleanup-smoke',state,ms:500,cores:1})});assert.equal(response.status,200);
  const output=(await response.text()).trim().split('\n').map(JSON.parse).at(-1);assert.equal(output.done,true);assert(!output.error,output.error);assert(legal(state,output.pv[0]));
  const row={engine:id,build:info.engineInfo.build,legal:true,action:output.pv[0],elapsedMs:output.elapsedMs};results.push(row);console.log(JSON.stringify(row));
 }finally{await service.close();}
}
await mkdir('reports/project-cleanup',{recursive:true});await writeFile('reports/project-cleanup/sigma-smoke.json',JSON.stringify({results},null,2));
