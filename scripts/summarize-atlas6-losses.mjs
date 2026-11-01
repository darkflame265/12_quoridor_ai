import {readdirSync,readFileSync} from 'node:fs';
import path from 'node:path';
const dir=process.argv[2]??'reports/atlas6-tournament/loss-traces';
const files=readdirSync(dir).filter(f=>f.endsWith('.json'));
const data=[];
for(const f of files){
 const d=JSON.parse(readFileSync(path.join(dir,f),'utf8'));
 if(!d.trace?.length)continue;
 const moves=d.trace.filter(r=>r.role==='atlas6');
 const starved=moves.filter(r=>r.state.left[d.atlasSide]===0&&r.state.left[1-d.atlasSide]>0);
 const earlyWalls=moves.filter(r=>r.action.type==='wall').length;
 const depths=moves.map(r=>r.depth).filter(Number.isFinite);
 data.push({file:f,fixture:d.fixture,atlasSide:d.atlasSide,plies:d.plies,earlyWalls,unarmedVsArmed:starved.length,
  firstUnarmedPly:starved[0]?.ply??null,averageDepth:depths.length?Number((depths.reduce((a,b)=>a+b,0)/depths.length).toFixed(2)):null});
}
console.log(JSON.stringify({matches:data.length,unarmedWhileOpponentHasWalls:data.filter(x=>x.unarmedVsArmed>0).length,rows:data},null,2));
