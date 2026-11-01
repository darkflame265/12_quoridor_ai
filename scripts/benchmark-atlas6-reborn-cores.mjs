import {NativeProcess} from '../server/native-process.mjs';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
const exe=fileURLToPath(new URL('../atlas6-reborn-engine/target/release/quoridor-atlas6-reborn.exe',import.meta.url));
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'));
const rows=[];
for(const i of [85,86,87,88])for(const cores of [1,2,4]){
 const ai=new NativeProcess({executable:exe,profile:'reborn'});
 try{
  const r=await ai.search(fixtures[i].state,{ms:500,cores});
  rows.push({fixture:fixtures[i].id,cores,depth:r.depth,nodes:r.nodes,elapsedMs:r.elapsedMs,action:r.pv?.[0]});
 }finally{ai.close();}
 console.log(JSON.stringify(rows.at(-1)));
}
const summary=[1,2,4].map(cores=>{const rs=rows.filter(r=>r.cores===cores);return {cores,meanDepth:rs.reduce((s,r)=>s+r.depth,0)/rs.length,meanNodes:Math.round(rs.reduce((s,r)=>s+r.nodes,0)/rs.length),positions:rs.length};});
writeFileSync('reports/atlas6-reborn/core-benchmark.json',JSON.stringify({summary,rows,caveat:'Small deterministic benchmark only; no playing-strength evidence'},null,2)+'\n');
console.log('SUMMARY',JSON.stringify(summary));
