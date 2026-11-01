import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {NativeProcess} from '../server/native-process.mjs';
import {legal} from '../src/engine.js';
const file=process.argv[2]??'reports/atlas6-reborn/diagnostic-4-traces/0000-seed-20261101-060.json';
const trace=JSON.parse(readFileSync(file,'utf8'));
const record=trace.trace.find(x=>x.role==='atlas6'&&x.ply===3);
if(!record)throw Error('trace missing ply 3');
const executable=fileURLToPath(new URL('../atlas6-reborn-engine/target/release/quoridor-atlas6-reborn.exe',import.meta.url));
const results=[];
for(let i=0;i<8;i++){
 const ai=new NativeProcess({executable,profile:'reborn'});
 try{
  const r=await ai.search(record.state,{ms:500,cores:4});
  if(!legal(record.state,r.pv[0]))throw Error('Illegal action');
  results.push({trial:i,action:r.pv[0],depth:r.depth,score:r.score,elapsedMs:r.elapsedMs});
 }finally{ai.close();}
}
const distinct=[...new Set(results.map(r=>JSON.stringify(r.action)))].length;
const out='reports/atlas6-reborn/repeatability-ply3.json';
writeFileSync(out,JSON.stringify({source:file,distinctActions:distinct,trials:results},null,2)+'\n');
console.log(JSON.stringify({distinctActions:distinct,trials:results.length,results},null,2));
