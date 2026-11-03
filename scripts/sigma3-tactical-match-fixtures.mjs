import {readFileSync,writeFileSync} from 'node:fs';
import {distance} from '../src/engine.js';
const flagged=JSON.parse(readFileSync('evaluation/sigma3-tactical-fixtures.json','utf8'));
const games=JSON.parse(readFileSync('reports/sigma-selfplay/sigma2-wallvalue-trial-24.json','utf8')).completed;
const key=s=>JSON.stringify([s.p,s.walls,s.left,s.turn]);
const fixtures=[],keys=new Set();
const add=(s,game,ply)=>{
 const k=key(s);if(keys.has(k))return false;
 keys.add(k);
 fixtures.push({sourceGame:game,sourcePly:ply,phase:'late',s,history:games[game].trace.slice(Math.max(0,ply-48),ply).map(t=>t.state)});
 return true;
};
for(const f of flagged)add(f.state,f.game,f.ply);
for(const g of games)for(const t of g.trace){
 if(fixtures.length>=12)break;
 const s=t.state;
 if(t.ply<25||distance(s,1-s.turn)>3)continue;
 if(fixtures.filter(x=>x.s.turn===s.turn).length>=6)continue;
 add(s,g.index,t.ply);
}
writeFileSync('evaluation/sigma3-tactical-match-fixtures.json',JSON.stringify(fixtures,null,2));
console.log('fixtures',fixtures.length,'side counts',fixtures.reduce((o,f)=>(o[f.s.turn]=(o[f.s.turn]||0)+1,o),{}),'ply',fixtures.map(x=>x.sourcePly));
