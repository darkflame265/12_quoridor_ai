import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {nativeSourceHash,digest,nativeSources} from '../evaluation/native-policy.mjs';
import {tactics,checkTactic,SPLITS,wilson} from '../evaluation/suite.js';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
import {initial,apply,legal} from '../src/engine.js';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const split=get('--split','validation'),pairs=Number(get('--pairs',split==='holdout'?4:3)),ms=Number(get('--ms',500)),cores=Number(get('--cores',4)),profile=get('--profile','candidate'),out=get('--out',`reports/native51/${split}`);
if(!['validation','holdout','development'].includes(split)||!['candidate','strategy'].includes(profile)||!Number.isInteger(pairs)||pairs<1||pairs>50||!Number.isFinite(ms)||ms<1||ms>30000||!Number.isInteger(cores)||cores<1||cores>4)throw Error('Invalid options');
try{await readFile(path.join(out,'report.json'));throw Error('Use a fresh output directory to preserve evaluation evidence');}catch(e){if(e.code!=='ENOENT')throw e;}
const manifest=JSON.parse(await readFile('native-engine/target/release/source-manifest.json'));
for(const file of nativeSources)if(manifest.sources[file]!==digest(await readFile(file)))throw Error('Native executable needs rebuilding');
const binaryHash=digest(await readFile(nativeExecutable));
await mkdir(path.join(out,'games'),{recursive:true});
const fixtureSplit=split==='development'?split:`native-${split}`,report={format:'native-arena-v1',status:'running',date:new Date().toISOString(),split,fixtureSeed:SPLITS[fixtureSplit],sourceHash:nativeSourceHash(),binaryHash,candidate:profile,baseline:'baseline',pairsPerSuite:pairs,ms,cores,tactics:[],games:[],timing:{candidate:{moves:0,elapsedMs:0,overruns:0},baseline:{moves:0,elapsedMs:0,overruns:0}}};
const counts=list=>({wins:list.filter(g=>g.result==='win').length,losses:list.filter(g=>g.result==='loss').length,draws:list.filter(g=>g.result==='draw').length});
async function save(){report.summary=counts(report.games);report.summary.bySuite=Object.fromEntries(['general','maze'].map(s=>[s,counts(report.games.filter(g=>g.suite===s))]));report.summary.decisiveWilson95=wilson(report.summary.wins,report.summary.losses);report.summary.pairScores=Array.from({length:pairs*2},(_,i)=>{const suite=i<pairs?'general':'maze',index=i%pairs;const games=report.games.filter(g=>g.suite===suite&&g.openingIndex===index);return {suite,index,complete:games.length===2,score:games.reduce((n,g)=>n+(g.result==='win'?1:g.result==='draw'?.5:0),0)/2};});await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));}
const tactical=new NativeProcess({profile});try{await tactical.health();for(const f of tactics()){const r=await tactical.search(f.state,{ms,cores});report.tactics.push({id:f.id,pass:checkTactic(f,r.pv[0]),action:r.pv[0]});}}finally{tactical.close();}await save();
try{for(const suite of ['general','maze'])for(const [index,opening] of nativeFixtures(split,suite,pairs).entries())for(const side of [0,1]){
 const candidate=new NativeProcess({profile}),baseline=new NativeProcess({profile:'baseline'});let state=structuredClone(opening.state),records=[...opening.records],reason='ply cap';const trace=[],seen=new Map();
 try{await candidate.health();await baseline.health();for(let ply=0;ply<180&&state.winner===null;ply++){
  const sig=JSON.stringify([state.p,state.left,state.turn,state.walls.map(w=>[w.x,w.y,w.o]).sort()]),count=(seen.get(sig)??0)+1;seen.set(sig,count);if(count===3){reason='threefold repetition';break;}
  const role=state.turn===side?'candidate':'baseline',start=performance.now(),r=await (role==='candidate'?candidate:baseline).search(state,{ms,cores}),elapsedMs=performance.now()-start,action=r.pv[0];if(!action||!legal(state,action))throw Error('Illegal engine move');
  const timing=report.timing[role];timing.moves++;timing.elapsedMs+=elapsedMs;if(elapsedMs>ms*1.2+5)timing.overruns++;
  trace.push({ply:records.length,turn:state.turn,role,action,score:r.score,depth:r.depth,nodes:r.nodes,elapsedMs,pv:r.pv});records.push(action);state=apply(state,action);
 }if(state.winner!==null)reason='goal';let replay=initial();for(const a of records){if(!legal(replay,a))throw Error('Illegal replay');replay=apply(replay,a);}if(replay.winner!==state.winner)throw Error('Replay result mismatch');
 const id=`${suite}-${index}-side${side}`,result=state.winner===null?'draw':state.winner===side?'win':'loss',file=`games/${id}.json`;await writeFile(path.join(out,file),JSON.stringify({version:1,id,records,trace,winner:state.winner,result,candidateSide:side,openingPlies:opening.records.length,reason},null,2));report.games.push({id,suite,openingIndex:index,candidateSide:side,result,winner:state.winner,reason,plies:trace.length,file,replayValidated:true});await save();console.log(`${split} ${id}: ${result}, ${trace.length} plies`);
 }finally{candidate.close();baseline.close();}
}if(nativeSourceHash()!==report.sourceHash)throw Error('Source changed during evaluation');report.status='completed';await save();console.log(JSON.stringify(report.summary));}
catch(error){report.status='failed';report.error=error.message;await save();throw error;}
