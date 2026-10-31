import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {pressureExecutable} from '../evaluation/pressure-policy.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {initial,apply,legal} from '../src/engine.js';
const atlas6=fileURLToPath(new URL('../atlas6-engine/target/release/quoridor-atlas6.exe',import.meta.url));
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-openings.json','utf8'));
const fixtureId=process.argv[4]??fixtures[0].id;
const opponent=process.argv[5]??'atlas53';
if(!['atlas53','atlas04'].includes(opponent))throw Error('Unknown opponent '+opponent);
const opening=fixtures.find(f=>f.id===fixtureId)?.state;
if(!opening)throw Error('Unknown fixture: '+fixtureId);
const ms=Number(process.argv[2]??500),maxPlies=Number(process.argv[3]??200);
if(!Number.isFinite(ms)||ms<1||ms>30000||!Number.isInteger(maxPlies)||maxPlies<1||maxPlies>200)throw Error("Invalid match budget: max 200 plies");
const results=[];
for(const atlasSide of [0,1]){
 const six=new NativeProcess({executable:atlas6}),five=new NativeProcess({executable:opponent==='atlas04'?pressureExecutable:nativeExecutable,profile:'candidate',env:opponent==='atlas04'?{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}:undefined});
 let s=structuredClone(opening);const trace=[];const seen=new Map();let reason="ply-cap";
 try{
  await Promise.all([six.health(),five.health()]);
  for(let ply=0;ply<maxPlies&&s.winner===null;ply++){
   const sig=JSON.stringify([s.p,[...s.walls].map(w=>[w.x,w.y,w.o]).sort(),s.left,s.turn]);const count=(seen.get(sig)??0)+1;seen.set(sig,count);if(count>=3){reason="threefold-repetition";break;}
   const role=s.turn===atlasSide?'atlas6':opponent;
   const r=await (role==='atlas6'?six:five).search(s,{ms,cores:4});
   if(!r.pv?.length||!legal(s,r.pv[0]))throw Error('Illegal '+role+' ply '+ply);
   trace.push({role,action:r.pv[0],depth:r.depth,elapsedMs:r.elapsedMs});
   s=apply(s,r.pv[0]);if(s.winner!==null)reason="goal";
  }
  const result={fixtureId,atlasSide,winner:s.winner,plies:trace.length,reason,atlas6Win:s.winner===atlasSide,completed:s.winner!==null,averageDepth:Object.fromEntries(['atlas6',opponent].map(role=>[role,trace.filter(x=>x.role===role).reduce((v,x)=>v+x.depth,0)/Math.max(1,trace.filter(x=>x.role===role).length)]))};
  results.push(result);console.log(JSON.stringify(result));
 }finally{six.close();five.close();}
}
console.log(JSON.stringify({fixtureId,opponent,ms,maxPlies,results,warning:'Small paired diagnostic only; no strength claim.'}));
