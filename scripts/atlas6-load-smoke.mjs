import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {readFileSync} from 'node:fs';
import {legal} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'));
const clients=Array.from({length:4},()=>createAtlas6Service());
try{
 const results=await Promise.all(clients.map(async (svc,i)=>{
  const start=performance.now();
  const state=fixtures[13+i].state;
  const r=await svc.client.search(state,{ms:500,cores:4});
  return {index:i,wallMs:Math.round(performance.now()-start),engineMs:Math.round(r.elapsedMs),depth:r.depth,legal:legal(state,r.pv[0])};
 }));
 console.log(JSON.stringify({parallelClients:clients.length,results}));
 if(results.some(r=>!r.legal||r.engineMs>560))process.exitCode=2;
}finally{await Promise.all(clients.map(c=>c.close()));}
