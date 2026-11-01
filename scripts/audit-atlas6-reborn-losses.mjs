import {readdirSync,readFileSync,writeFileSync} from 'node:fs';
import {distance,apply,legal} from '../src/engine.js';
const dir='reports/atlas6-reborn/protected-threats-standard15-traces';
const files=readdirSync(dir).filter(x=>x.endsWith('.json'));
const games=[];
for(const file of files){
 const d=JSON.parse(readFileSync(`${dir}/${file}`,'utf8'));let warnings=[];let depths=[];let wallNoTempo=0;let lowDepth=0;let exact=0;let missing=0;
 for(const r of d.trace.filter(x=>x.role==='atlas6')){
  if(!legal(r.state,r.action))throw Error('illegal recorded action '+file+' ply '+r.ply);
  if(r.exact){exact++;continue;}
  if(!r.rootDiagnostics){missing++;continue;}
  depths.push(r.depth);
  if(r.depth<=3)lowDepth++;
  const next=apply(r.state,r.action);
  const own=r.side,other=1-own;
  if(r.action.type==='wall' && distance(next,other)-distance(r.state,other)<=distance(next,own)-distance(r.state,own)){
   wallNoTempo++;warnings.push(r.ply);
  }
 }
 games.push({file,fixture:d.fixture,side:d.atlasSide,plies:d.plies,ourPlies:d.trace.filter(x=>x.role==='atlas6').length,averageDepth:depths.length?Number((depths.reduce((a,b)=>a+b,0)/depths.length).toFixed(2)):null,lowDepth,exact,missing,wallNoTempo,suspectPlies:warnings.slice(0,12)});
}
const out={scope:'experimental variant losses only; not original 5.3 clone 8 losses',games:games.length,summary:{avgDepth:games.reduce((x,y)=>x+(y.averageDepth||0),0)/games.length,wallNoTempo:games.reduce((x,y)=>x+y.wallNoTempo,0),exact:games.reduce((x,y)=>x+y.exact,0),missing:games.reduce((x,y)=>x+y.missing,0)},cases:games,caveat:'No causal mistake can be inferred from these heuristics'};
writeFileSync('reports/atlas6-reborn/loss-diagnosis.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
