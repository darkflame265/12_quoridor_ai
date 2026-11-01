import {readFileSync} from 'node:fs';
import {distance,legal,apply} from '../src/engine.js';
const file=process.argv[2];
if(!file)throw Error('Usage: node scripts/analyze-atlas6-loss.mjs <trace.json>');
const data=JSON.parse(readFileSync(file,'utf8'));
if(!Array.isArray(data.trace))throw Error('Trace missing');
const rows=[];
for(const r of data.trace){
 if(r.role!=='atlas6')continue;
 const next=apply(r.state,r.action);
 const own=r.side,enemy=1-own;
 const before=[distance(r.state,own),distance(r.state,enemy)];
 const after=[distance(next,own),distance(next,enemy)];
 const wallCost=r.state.left[own]-next.left[own];
 const swing=(after[1]-before[1])-(after[0]-before[0]);
 rows.push({ply:r.ply,depth:r.depth,action:r.action,ownDistBefore:before[0],oppDistBefore:before[1],ownDistAfter:after[0],oppDistAfter:after[1],wallCost,swing});
}
const poorWalls=rows.filter(x=>x.wallCost&&x.swing<1);
const backward=rows.filter(x=>!x.wallCost&&x.ownDistAfter>x.ownDistBefore);
console.log(JSON.stringify({fixture:data.fixture,atlasSide:data.atlasSide,final:data.reason,plies:data.plies,atlasMoves:rows.length,poorWalls,backward,latest:rows.slice(-12)},null,2));
