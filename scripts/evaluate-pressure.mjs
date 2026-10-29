import {mkdir,writeFile,readFile} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {nativeSourceHash,activeNativeProfile,digest} from '../evaluation/native-policy.mjs';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
import {initial,apply,legal} from '../src/engine.js';
import {pressureMetrics} from '../src/pressure-advice.js';
const args=process.argv.slice(2),get=(name,fallback)=>{const i=args.indexOf(name);return i<0?fallback:args[i+1];},out=get('--out','reports/immediate-pressure/development'),pairs=Number(get('--pairs',2)),ms=Number(get('--ms',500)),cores=Number(get('--cores',4)),split=get('--split','development');
if(!Number.isInteger(pairs)||pairs<1||pairs>20||ms<1||ms>30000||!Number.isInteger(cores)||cores<1||cores>4||!['development','validation','holdout'].includes(split))throw Error('Invalid arena options');
try{await readFile(path.join(out,'report.json'));throw Error('Use a fresh arena output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const identity=verifyPressureBuild();if(activeNativeProfile()!=='candidate')throw Error('Stable 5.3 unavailable');await mkdir(path.join(out,'games'),{recursive:true});
const report={status:'running',split,ms,cores,pairsPerSuite:pairs,identity,nativeSourceHash:nativeSourceHash(),nativeBinaryHash:digest(await readFile(nativeExecutable)),games:[],timing:{candidate:{moves:0,elapsedMs:0,overruns:0},stable:{moves:0,elapsedMs:0,overruns:0}},metrics:{candidate:{walls:0,nearWalls:0,negativeImmediateNet:0,totalDelay:0},stable:{walls:0,nearWalls:0,negativeImmediateNet:0,totalDelay:0}},productionPromoted:false};
async function save(){report.summary={wins:report.games.filter(g=>g.result==='win').length,losses:report.games.filter(g=>g.result==='loss').length,draws:report.games.filter(g=>g.result==='draw').length};report.summary.bySuite=Object.fromEntries(['general','maze'].map(s=>{const games=report.games.filter(g=>g.suite===s);return [s,{wins:games.filter(g=>g.result==='win').length,losses:games.filter(g=>g.result==='loss').length,draws:games.filter(g=>g.result==='draw').length}];}));await writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
try{for(const suite of ['general','maze'])for(const [index,opening]of nativeFixtures(split,suite,pairs,'v3').entries())for(const side of [0,1]){
 const candidate=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on'}}),stable=new NativeProcess({profile:'candidate'});let state=structuredClone(opening.state),records=[...opening.records],reason='ply cap';const trace=[],seen=new Map();
 try{await Promise.all([candidate.health(),stable.health()]);for(let ply=0;ply<180&&state.winner===null;ply++){
  const signature=JSON.stringify([state.p,state.left,state.turn,state.walls.map(w=>[w.x,w.y,w.o]).sort()]),count=(seen.get(signature)??0)+1;seen.set(signature,count);if(count>=3){reason='repetition';break;}
  const role=state.turn===side?'candidate':'stable',start=performance.now(),r=await(role==='candidate'?candidate:stable).search(state,{ms,cores}),elapsedMs=performance.now()-start,action=r.pv[0];if(!action||!legal(state,action))throw Error('Illegal engine action');
  const timing=report.timing[role];timing.moves++;timing.elapsedMs+=elapsedMs;if(elapsedMs>ms*1.2+5)timing.overruns++;
  const pressure=pressureMetrics(state,action);if(action.type==='wall'){const m=report.metrics[role];m.walls++;m.totalDelay+=pressure.enemyDelay;if(pressure.firstContact!==null&&pressure.firstContact<3)m.nearWalls++;if(pressure.netGain<0)m.negativeImmediateNet++;}
  trace.push({turn:state.turn,role,action,score:r.score,depth:r.depth,nodes:r.nodes,elapsedMs,pressure});records.push(action);state=apply(state,action);
 }if(state.winner!==null)reason='goal';let replay=initial();for(const a of records){if(!legal(replay,a))throw Error('Illegal replay');replay=apply(replay,a);}if(JSON.stringify(replay.p)!==JSON.stringify(state.p)||replay.winner!==state.winner)throw Error('Replay mismatch');
 const id=`${suite}-${index}-side${side}`,result=state.winner===null?'draw':state.winner===side?'win':'loss',file=`games/${id}.json`;await writeFile(path.join(out,file),JSON.stringify({id,records,trace,winner:state.winner,candidateSide:side,result,reason},null,2)+'\n');report.games.push({id,suite,openingIndex:index,candidateSide:side,result,reason,plies:trace.length,file,replayValidated:true});await save();console.log(`${id}: ${result} (${trace.length} plies)`);
 }finally{candidate.close();stable.close();}
}if(nativeSourceHash()!==report.nativeSourceHash)throw Error('Native source changed');report.status='completed';await save();console.log(JSON.stringify({summary:report.summary,metrics:report.metrics,timing:report.timing,productionPromoted:false}));}catch(error){report.status='failed';report.error=error.message;await save();throw error;}
