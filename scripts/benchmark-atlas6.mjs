import {NativeProcess} from '../server/native-process.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const exe=fileURLToPath(new URL('../atlas6-engine/target/release/quoridor-atlas6.exe',import.meta.url));
const positions=JSON.parse(readFileSync('evaluation/atlas6-openings.json','utf8'));
const ms=Number(process.argv[2]??500);
const count=Number(process.argv[3]??7);
if(!(ms>=100&&ms<=30000)||!Number.isInteger(count)||count<1||count>positions.length)throw Error('Invalid benchmark settings');
for(const cores of [1,2,4]){
 const engine=new NativeProcess({executable:exe});
 try{
  await engine.health();
  const stats=[];
  for(const {id,state} of positions.slice(0,count)){
   const r=await engine.search(state,{ms,cores});
   stats.push({id,depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,exact:r.exact});
  }
  const mean=(name)=>stats.reduce((a,x)=>a+x[name],0)/stats.length;
  console.log(JSON.stringify({cores,ms,positions:stats.length,averageDepth:Number(mean('depth').toFixed(2)),averageNodes:Math.round(mean('nodes')),maxElapsedMs:Math.round(Math.max(...stats.map(x=>x.elapsedMs))),details:stats}));
 }finally{engine.close();}
}
