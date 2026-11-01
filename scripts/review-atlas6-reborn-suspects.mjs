import {readFileSync,writeFileSync} from 'node:fs';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {legal} from '../src/engine.js';
const file=process.argv[2];
const data=JSON.parse(readFileSync(file,'utf8'));
const suspects=data.trace.filter(x=>x.role==='atlas6'&&x.action.type==='wall').slice(0,6);
const referee=new NativeProcess({executable:nativeExecutable,profile:'candidate'});
const results=[];
try{
 await referee.health();
 for(const r of suspects){
  const response=await referee.search(r.state,{ms:1500,cores:4});
  if(!legal(r.state,response.pv[0]))throw Error('illegal referee recommendation');
  const different=JSON.stringify(response.pv[0])!==JSON.stringify(r.action);
  results.push({ply:r.ply,original:r.action,originalScore:r.score,originalDepth:r.depth,refereeAction:response.pv[0],refereeScore:response.score,refereeDepth:response.depth,different,status:'unproven_difference'});
  console.log(JSON.stringify(results.at(-1)));
 }
}finally{referee.close();}
const output=file.replace(/\.json$/,'.review.json');
writeFileSync(output,JSON.stringify({source:file,results,note:'Opponent preference is not an independent proof of best play.'},null,2)+'\n');
