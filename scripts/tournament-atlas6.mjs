import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {pressureExecutable} from '../evaluation/pressure-policy.mjs';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {apply,legal} from '../src/engine.js';
const atlas=fileURLToPath(new URL('../atlas6-engine/target/release/quoridor-atlas6.exe',import.meta.url));
const fixtures=JSON.parse(await readFile('evaluation/atlas6-openings.json','utf8'));
const args=process.argv.slice(2);
const opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const games=Number(opt('--games','200')),ms=Number(opt('--ms','500')),opponent=opt('--opponent','atlas53'),out=opt('--out','reports/atlas6-tournament/report.json');
if(!Number.isInteger(games)||games<2||games>2000||games%2||!Number.isFinite(ms)||ms<1||ms>30000||!['atlas53','atlas04'].includes(opponent))throw Error('Invalid tournament options; games must be even, ms 1..30000');
const env=opponent==='atlas04'?{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}:undefined;
const report={schema:'atlas6-tournament-v1',opponent,gamesRequested:games,ms,maxPlies:200,finished:0,wins:0,losses:0,draws:0,results:[]};
await mkdir(path.dirname(out),{recursive:true});
for(let i=0;i<games;i++){
 const fixture=fixtures[Math.floor(i/2)%fixtures.length],atlasSide=i%2;
 const a=new NativeProcess({executable:atlas,profile:'baseline'});
 const b=new NativeProcess({executable:opponent==='atlas04'?pressureExecutable:nativeExecutable,profile:'candidate',env});
 let state=structuredClone(fixture.state),reason='ply-cap',plies=0,overruns=0;
 const seen=new Map();
 try{
  await Promise.all([a.health(),b.health()]);
  for(let ply=0;ply<200&&state.winner===null;ply++){
   const key=JSON.stringify([state.p,[...state.walls].map(w=>[w.x,w.y,w.o]).sort(),state.left,state.turn]);
   const repeated=seen.get(key)??0;seen.set(key,repeated+1);
   if(repeated>=2){reason='repetition';break;}
   const search=state.turn===atlasSide?a:b,start=performance.now();
   const response=await search.search(state,{ms,cores:4});
   const elapsed=performance.now()-start;
   if(elapsed>ms*1.2+10)overruns++;
   if(!response.pv?.length||!legal(state,response.pv[0]))throw Error('Illegal move at '+ply);
   state=apply(state,response.pv[0]);plies++;
   if(state.winner!==null)reason='goal';
  }
  const verdict=state.winner===null?'draw':state.winner===atlasSide?'win':'loss';
  report[verdict==='win'?'wins':verdict==='loss'?'losses':'draws']++;
  report.results.push({fixture:fixture.id,atlasSide,verdict,winner:state.winner,reason,plies,overruns});
  report.finished++;
  await writeFile(out,JSON.stringify(report,null,2)+'\n');
  console.log(i+1+'/'+games,fixture.id,'side',atlasSide,verdict,plies,reason);
 }finally{a.close();b.close();}
}
