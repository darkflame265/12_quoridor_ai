import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {activeNativeProfile,digest} from '../evaluation/native-policy.mjs';
import {verifyMazeBuild,mazeExecutable,mazeModes} from '../evaluation/maze-candidate-policy.mjs';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
import {initial,apply,legal} from '../src/engine.js';
import {tactics,checkTactic} from '../evaluation/suite.js';
const args=process.argv.slice(2),get=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const out=get('--out','reports/maze-candidate/development'),split=get('--split','development'),pairs=Number(get('--pairs',2)),ms=Number(get('--ms',500)),cores=Number(get('--cores',4)),maxPlies=Number(get('--max-plies',180));
const mode=get('--mode','cache4');if(!mazeModes.includes(mode))throw Error('Unknown maze evaluation mode');process.env.QUORIDOR_MAZE_MODE=mode;
if(!['development','validation','holdout'].includes(split)||!Number.isInteger(pairs)||pairs<1||pairs>50||!Number.isInteger(ms)||ms<1||ms>30000||!Number.isInteger(cores)||cores<1||cores>4||!Number.isInteger(maxPlies)||maxPlies<1)throw Error('Invalid arena options');
if(activeNativeProfile()!=='candidate')throw Error('Approved Atlas 5.3 baseline unavailable');
try{await readFile(path.join(out,'report.json'));throw Error('Use a fresh output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const identity=verifyMazeBuild(),baselineBinary=digest(await readFile(nativeExecutable));
const sources=Object.fromEntries(await Promise.all(['scripts/evaluate-maze.mjs','evaluation/maze-candidate-policy.mjs','evaluation/native-fixtures.mjs','evaluation/suite.js','src/engine.js'].map(async f=>[f,digest(await readFile(f))])));
await mkdir(path.join(out,'games'),{recursive:true});
const report={format:'atlas-maze-candidate-arena-v2',status:'running',mode,split,pairs,ms,cores,maxPlies,identity,baselineBinary,sources,games:[],tactics:[],timing:{candidate:{moves:0,elapsedMs:0,overruns:0},baseline:{moves:0,elapsedMs:0,overruns:0}},productionActive:false};
const save=async()=>{report.summary=Object.fromEntries(['win','loss','draw'].map(result=>[result,report.games.filter(g=>g.result===result).length]));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');};
const engine=()=>new NativeProcess({executable:mazeExecutable,profile:'candidate'});
try{
 const e=engine();try{await e.health();for(const f of tactics()){const r=await e.search(f.state,{ms,cores});report.tactics.push({id:f.id,pass:checkTactic(f,r.pv[0]),action:r.pv[0]});}}finally{e.close();}await save();
 for(const suite of ['general','maze'])for(const [index,opening] of nativeFixtures(split,suite,pairs,'v3').entries())for(const side of [0,1]){
  const candidate=engine(),baseline=new NativeProcess({profile:'candidate'});let state=opening.state,records=[...opening.records],trace=[],reason='ply cap';const seen=new Map();
  try{await candidate.health();await baseline.health();for(let ply=0;ply<maxPlies&&state.winner===null;ply++){
   const sig=JSON.stringify([state.p,state.left,state.turn,state.walls.map(w=>[w.x,w.y,w.o]).sort()]),count=(seen.get(sig)??0)+1;seen.set(sig,count);if(count===3){reason='repetition draw';break;}
   const role=state.turn===side?'candidate':'baseline',started=performance.now(),r=await (role==='candidate'?candidate:baseline).search(state,{ms,cores}),elapsedMs=performance.now()-started,a=r.pv[0];if(!a||!legal(state,a))throw Error('Illegal candidate game action');
   const t=report.timing[role];t.moves++;t.elapsedMs+=elapsedMs;t.overruns+=Number(elapsedMs>ms*1.2+5);
   trace.push({ply:records.length,turn:state.turn,role,action:a,elapsedMs,depth:r.depth,nodes:r.nodes,score:r.score,pv:r.pv});records.push(a);state=apply(state,a);
  }if(state.winner!==null)reason='goal';let replay=initial();for(const a of records){if(!legal(replay,a))throw Error('Illegal replay');replay=apply(replay,a);}if(JSON.stringify(replay)!==JSON.stringify(state))throw Error('Replay state mismatch');
  const result=state.winner===null?'draw':state.winner===side?'win':'loss',id=`${suite}-${index}-side${side}`,file=`games/${id}.json`,game={version:1,records,trace,winner:state.winner,reason,result,candidateSide:side,openingPlies:opening.records.length};const bytes=JSON.stringify(game,null,2)+'\n';await writeFile(path.join(out,file),bytes);report.games.push({id,suite,openingIndex:index,candidateSide:side,result,reason,file,sha256:digest(bytes),replayValidated:true});await save();console.log(`${id}: ${result}, ${trace.length} plies`);
  }finally{candidate.close();baseline.close();}
 }
 if(JSON.stringify(verifyMazeBuild())!==JSON.stringify(identity)||digest(await readFile(nativeExecutable))!==baselineBinary)throw Error('Engine changed during arena');for(const [f,h] of Object.entries(sources))if(digest(await readFile(f))!==h)throw Error('Arena code changed');report.status='completed';await save();console.log(JSON.stringify(report.summary));
}catch(error){report.status='interrupted';report.error=error.message;await save();throw error;}
