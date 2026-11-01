import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {apply,legal} from '../src/engine.js';
const file=process.argv[2]??'reports/atlas6-reborn/diagnostic-4-traces/0000-seed-20261101-060.json';
const ply=Number(process.argv[3]??3),maxPlies=Number(process.argv[4]??70);
const repetitions=Number(process.argv[5]??1);
if(!Number.isInteger(repetitions)||repetitions<1||repetitions>100)throw Error('repetitions must be between 1 and 100');
const data=JSON.parse(readFileSync(file,'utf8'));
const review=JSON.parse(readFileSync(file.replace(/\.json$/,'.review.json'),'utf8'));
const prior=data.trace.find(r=>r.ply===ply&&r.role==='atlas6');
const candidate=review.results.find(r=>r.ply===ply&&r.different);
if(!prior||!candidate)throw Error('No differing candidate at ply '+ply);
const reborn=fileURLToPath(new URL('../atlas6-reborn-engine/target/release/quoridor-atlas6-reborn.exe',import.meta.url));
const results=[];
for(let trial=0;trial<repetitions;trial++)for(const variant of trial%2===0?['original','referee']:['referee','original']){
 const action=variant==='original'?prior.action:candidate.refereeAction;
 if(!legal(prior.state,action))throw Error('illegal alternative');
 const a=new NativeProcess({executable:reborn,profile:'reborn'});
 const b=new NativeProcess({executable:nativeExecutable,profile:'candidate'});
 let state=apply(prior.state,action),moves=1,reason='ply-cap';
 try{
  await Promise.all([a.health(),b.health()]);
  const seen=new Map();
  while(state.winner===null&&moves<maxPlies){
   const key=JSON.stringify([state.p,state.walls,state.left,state.turn]);
   const count=seen.get(key)??0;
   if(count>=2){reason='threefold-repetition';break;}
   seen.set(key,count+1);
   const engine=state.turn===data.atlasSide?a:b;
   const response=await engine.search(state,{ms:500,cores:4});
   if(!response.pv?.length||!legal(state,response.pv[0]))throw Error('illegal response '+moves);
   state=apply(state,response.pv[0]);moves++;
  }
  if(state.winner!==null)reason='goal';
  results.push({trial,variant,firstAction:action,reason,moves,winner:state.winner,verdict:state.winner===null?'undecided':state.winner===data.atlasSide?'win':'loss'});
  console.log(JSON.stringify(results.at(-1)));
 }finally{a.close();b.close();}
}
mkdirSync('reports/atlas6-reborn/counterfactual',{recursive:true});
const out='reports/atlas6-reborn/counterfactual/'+data.fixture+'-ply'+ply+'-n'+repetitions+'.json';
const tally=Object.fromEntries(['original','referee'].map(v=>[v,{win:results.filter(r=>r.variant===v&&r.verdict==='win').length,loss:results.filter(r=>r.variant===v&&r.verdict==='loss').length,undecided:results.filter(r=>r.variant===v&&r.verdict==='undecided').length}]));
writeFileSync(out,JSON.stringify({source:file,ply,repetitions,tally,originalBuild:data.engineBuild,refereeBuild:data.opponentBuild,results,caveat:'One deterministic continuation per branch is not an optimal-play proof.'},null,2)+'\n');
