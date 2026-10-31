import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {pressureExecutable} from '../evaluation/pressure-policy.mjs';
import {readFile,mkdir,writeFile,rename} from 'node:fs/promises';
import {existsSync,readFileSync as readSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {apply,legal} from '../src/engine.js';

const atlas=fileURLToPath(new URL('../atlas6-engine/target/release/quoridor-atlas6.exe',import.meta.url));
const args=process.argv.slice(2);
const opt=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const games=Number(opt('--games','200')),ms=Number(opt('--ms','500'));
const opponent=opt('--opponent','atlas53'),cores=Number(opt('--cores','4'));
const split=opt('--split','all'),resume=args.includes('--resume');
const out=opt('--out','reports/atlas6-tournament/report-'+opponent+'.json');
if(!Number.isInteger(games)||games<2||games>2000||games%2||
  !Number.isFinite(ms)||ms<1||ms>30000||![1,2,4].includes(cores)||
  !['atlas53','atlas04','atlas6base'].includes(opponent)||!['all','validation','holdout'].includes(split))
  throw Error('Invalid tournament options');
const fixtureFile=readSync('evaluation/atlas6-tournament-openings.json');
const allFixtures=JSON.parse(fixtureFile);
const fixtures=split==='all'?allFixtures:allFixtures.filter((_,i)=>split==='validation'?i%2===0:i%2===1);
const binary=opponent==='atlas6base'?path.resolve(opt('--opponent-bin','.local-app/atlas6-before-stock.exe')):opponent==='atlas04'?pressureExecutable:nativeExecutable;
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const identity={opponent,engineBuild:sha(readSync(atlas)),opponentBuild:sha(readSync(binary)),
 fixtureHash:sha(fixtureFile),ms,cores,maxPlies:200,split,gamesRequested:games};
const env=opponent==='atlas04'?{QUORIDOR_PRESSURE_MODE:'on',
 QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',
 QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',
 QUORIDOR_GOAL_DEEP_MODE:'off'}:undefined;
const fresh=()=>({schema:'atlas6-tournament-v2',...identity,startedAt:new Date().toISOString(),
 finished:0,wins:0,losses:0,draws:0,moves:0,overruns:0,results:[]});
let report=fresh();
await mkdir(path.dirname(out),{recursive:true});
if(resume&&existsSync(out)){
 report=JSON.parse(await readFile(out,'utf8'));
 for(const [key,value] of Object.entries(identity))if(report[key]!==value)throw Error('Resume mismatch: '+key);
 if(report.finished!==report.results.length)throw Error('Corrupt resume report');
}
const save=async()=>{const tmp=out+'.tmp';await writeFile(tmp,JSON.stringify(report,null,2)+'\n');await rename(tmp,out);};
for(let i=report.finished;i<games;i++){
 const fixture=fixtures[Math.floor(i/2)%fixtures.length],atlasSide=i%2;
 const a=new NativeProcess({executable:atlas,profile:'baseline'});
 const b=new NativeProcess({executable:binary,profile:'candidate',env});
 let state=structuredClone(fixture.state),reason='ply-cap',plies=0,overruns=0;
 const seen=new Map();
 try{
  await Promise.all([a.health(),b.health()]);
  for(let ply=0;ply<200&&state.winner===null;ply++){
   const key=JSON.stringify([state.p,[...state.walls].map(w=>[w.x,w.y,w.o]).sort(),state.left,state.turn]);
   const repeated=seen.get(key)??0;seen.set(key,repeated+1);
   if(repeated>=2){reason='threefold-repetition';break;}
   const engine=state.turn===atlasSide?a:b,start=performance.now();
   const response=await engine.search(state,{ms,cores});
   const elapsed=performance.now()-start;
   if(elapsed>ms+25 || response.elapsedMs>ms+10)overruns++;
   if(!response.pv?.length||!legal(state,response.pv[0]))throw Error('Illegal move: '+fixture.id+' ply '+ply);
   state=apply(state,response.pv[0]);plies++;
   if(state.winner!==null)reason='goal';
  }
  const verdict=state.winner===null?'draw':state.winner===atlasSide?'win':'loss';
  report[verdict==='win'?'wins':verdict==='loss'?'losses':'draws']++;
  report.results.push({fixture:fixture.id,atlasSide,verdict,winner:state.winner,reason,plies,overruns});
  report.moves+=plies;report.overruns+=overruns;report.finished++;
  await save();
  console.log(i+1+'/'+games,fixture.id,'side',atlasSide,verdict,plies,reason);
 }finally{await a.close();await b.close();}
}
console.log(JSON.stringify({finished:report.finished,wins:report.wins,losses:report.losses,draws:report.draws,overruns:report.overruns,moves:report.moves}));
