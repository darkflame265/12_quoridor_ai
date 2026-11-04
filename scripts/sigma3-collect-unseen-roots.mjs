import {readFileSync,writeFileSync} from 'node:fs';
import {distance} from '../src/engine.js';
const files=['sigma2-wallvalue-trial-24.json','sigma2-wallvalue-trial-24-seed2.json','sigma2-seed20261102-baseline24.json','sigma2-threat-diverse4.json'];
const old=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const keys=new Set(old.map(f=>JSON.stringify([f.s.p,f.s.walls,f.s.left,f.s.turn])));
const extra=JSON.parse(readFileSync('evaluation/sigma3-independent-middle-fixtures.json','utf8'));
for(const f of extra)keys.add(JSON.stringify([f.s.p,f.s.walls,f.s.left,f.s.turn]));
const chosen=[];
for(const name of files){
 const data=JSON.parse(readFileSync('reports/sigma-selfplay/'+name,'utf8'));
 const found=[];
 for(const g of data.completed||[]){
  for(const t of g.trace||[]){
   const s=t.state;if(!s?.walls||s.winner!==null||s.walls.length<6||s.walls.length>12)continue;
   if(Math.min(distance(s,0),distance(s,1))<3)continue;
   if(Math.abs(distance(s,0)-distance(s,1))>5)continue;
   const k=JSON.stringify([s.p,s.walls,s.left,s.turn]);
   if(keys.has(k))continue;
   keys.add(k);
   found.push({id:-1,file:name,sourceGame:g.index,phase:'middle',ply:t.ply,s,
    history:g.trace.filter(x=>x.ply<t.ply).slice(-48).map(x=>x.state)});
   break;
  }
 }
 const places=[0,Math.floor(found.length/2),Math.max(0,found.length-1)];
 const variants=[...new Set(places)].map(i=>found[i]).filter(Boolean);
 chosen.push(...variants.slice(0,2));
 console.log(name,'eligible distinct games',found.length,'samples',variants.slice(0,2).map(f=>[f.sourceGame,f.ply,f.s.walls.length]));
}
chosen.forEach((f,i)=>{f.id=100+i;});
writeFileSync('evaluation/sigma3-unseen-middle-roots.json',JSON.stringify(chosen,null,2));
console.log('TOTAL',chosen.length,'distinct',new Set(chosen.map(x=>JSON.stringify(x.s))).size);
