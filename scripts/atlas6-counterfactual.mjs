import {readFileSync,writeFileSync} from 'node:fs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {legal,distance,apply} from '../src/engine.js';
const file=process.argv[2]??'reports/atlas6-tournament/loss-traces/0000-game11-ply12.json';
const trace=JSON.parse(readFileSync(file,'utf8'));
const ms=Number(process.argv[3]??2000);
const points=trace.trace.filter(r=>r.role==='atlas6'&&r.state.left[r.side]>0).slice(0,10);
const svc=createAtlas6Service();
const cases=[];
try{
 for(const r of points){
  const deeper=await svc.client.search(r.state,{ms,cores:4});
  if(!legal(r.state,deeper.pv[0]))throw Error('Illegal deeper move');
  const chosen=apply(r.state,r.action),candidate=apply(r.state,deeper.pv[0]);
  cases.push({ply:r.ply,oldAction:r.action,newAction:deeper.pv[0],changed:JSON.stringify(r.action)!==JSON.stringify(deeper.pv[0]),oldDepth:r.depth,newDepth:deeper.depth,score:deeper.score,oldDistances:[distance(chosen,r.side),distance(chosen,1-r.side)],newDistances:[distance(candidate,r.side),distance(candidate,1-r.side)]});
  console.log(JSON.stringify(cases.at(-1)));
 }
}finally{await svc.close();}
writeFileSync('reports/atlas6-tournament/counterfactual-'+trace.fixture+'.json',JSON.stringify({file,ms,cases},null,2)+'\n');
