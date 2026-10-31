import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {initial,apply,legal} from '../src/engine.js';
const atlas6=fileURLToPath(new URL('../atlas6-engine/target/release/quoridor-atlas6.exe',import.meta.url));
const opening=JSON.parse(readFileSync('reports/game12-loss/trace.json','utf8')).rows[8].state;
const ms=Number(process.argv[2]??500),maxPlies=Number(process.argv[3]??200);
const results=[];
for(const atlasSide of [0,1]){
 const six=new NativeProcess({executable:atlas6}),five=new NativeProcess({executable:nativeExecutable,profile:'candidate'});
 let s=structuredClone(opening);const trace=[];const seen=new Map();
 try{
  await Promise.all([six.health(),five.health()]);
  for(let ply=0;ply<maxPlies&&s.winner===null;ply++){
   const sig=JSON.stringify([s.p,s.walls,s.left,s.turn]);const count=(seen.get(sig)??0)+1;seen.set(sig,count);if(count>=3)break;
   const role=s.turn===atlasSide?'atlas6':'atlas53';
   const r=await (role==='atlas6'?six:five).search(s,{ms,cores:4});
   if(!r.pv?.length||!legal(s,r.pv[0]))throw Error('Illegal '+role+' ply '+ply);
   trace.push({role,action:r.pv[0],depth:r.depth,elapsedMs:r.elapsedMs});
   s=apply(s,r.pv[0]);
  }
  const result={atlasSide,winner:s.winner,plies:trace.length,atlas6Win:s.winner===atlasSide,completed:s.winner!==null,averageDepth:Object.fromEntries(['atlas6','atlas53'].map(role=>[role,trace.filter(x=>x.role===role).reduce((v,x)=>v+x.depth,0)/Math.max(1,trace.filter(x=>x.role===role).length)]))};
  results.push(result);console.log(JSON.stringify(result));
 }finally{six.close();five.close();}
}
console.log(JSON.stringify({ms,maxPlies,results,warning:'Small paired diagnostic only; no strength claim.'}));
