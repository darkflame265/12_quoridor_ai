import {readFileSync,writeFileSync} from 'node:fs';
import {distance} from '../src/engine.js';
const j=JSON.parse(readFileSync('reports/sigma-selfplay/sigma2-wallvalue-trial-24.json','utf8'));
const out=[],seen=new Set(),byGame=new Set();
for(let pass=0;pass<2;pass++)for(const g of j.completed||[])for(const t of g.trace||[]){
 const s=t.state;
 if(!s||s.winner!==null||s.left[1-s.turn]!==0)continue;
 const my=distance(s,s.turn),enemy=distance(s,1-s.turn);
 if(my>4||enemy>6)continue;
 if(pass===0&&byGame.has(g.index))continue;
 const key=JSON.stringify([s.p,s.walls,s.left,s.turn]);
 if(seen.has(key))continue;
 seen.add(key);byGame.add(g.index);
 out.push({file:'sigma2-wallvalue-trial-24',phase:my<=2?'finish':'race',sourceGame:g.index,sourcePly:t.ply,s,history:g.trace.slice(Math.max(0,t.ply-48),t.ply).map(v=>v.state)});
 if(out.length>=12)break;
 if(out.length>=12)break;
}
out.splice(12);
writeFileSync('evaluation/sigma3-attack-match-fixtures.json',JSON.stringify(out,null,2));
console.log('attack fixtures',out.length,JSON.stringify(out.map(f=>({g:f.sourceGame,ply:f.sourcePly,my:distance(f.s,f.s.turn),enemy:distance(f.s,1-f.s.turn),myWalls:f.s.left[f.s.turn]}))));
