import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {legal} from '../src/engine.js';
const file=process.argv[2]??'reports/atlas6-tournament/loss-traces/0000-game11-ply12.json';
const trace=JSON.parse(readFileSync(file,'utf8'));
const count=Math.min(12,Math.max(1,Number(process.argv[3]??8)));
const ms=Math.min(3000,Math.max(100,Number(process.argv[4]??500)));
const entries=trace.trace.filter(r=>r.role==='atlas6').slice(0,count);
const atlas=createAtlas6Service();
const referee=new NativeProcess({executable:nativeExecutable,profile:'baseline'});
const comparison=[];
try{
 await referee.health();
 for(const r of entries){
  const [current,strong]=await Promise.all([atlas.client.search(r.state,{ms,cores:4}),referee.search(r.state,{ms,cores:4})]);
  if(!legal(r.state,current.pv[0])||!legal(r.state,strong.pv[0]))throw Error('Illegal recommendation');
  comparison.push({ply:r.ply,original:r.action,atlas:current.pv[0],atlasDepth:current.depth,atlasScore:current.score,referee:strong.pv[0],refereeDepth:strong.depth,refereeScore:strong.score,disagree:JSON.stringify(current.pv[0])!==JSON.stringify(strong.pv[0])});
  console.log(JSON.stringify(comparison.at(-1)));
 }
}finally{await atlas.close();referee.close();}
const out='reports/atlas6-tournament/atlas53-disagreement-'+trace.fixture+'.json';
mkdirSync(path.dirname(out),{recursive:true});
writeFileSync(out,JSON.stringify({source:file,ms,comparison},null,2)+'\n');
