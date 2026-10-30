import fs from 'node:fs';
import {randomUUID} from 'node:crypto';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {apply,notation} from '../src/engine.js';
import {ScreenPonder} from '../src/screen-ponder.js';
import {wallStreak} from '../src/wall-streak.js';
const game=JSON.parse(fs.readFileSync('evaluation/fixtures/game8-record.json','utf8'));
const states=[];let s=game.baseState;for(const a of game.records){states.push(s);s=apply(s,a);}
const env={QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'};
const build=verifyPressureBuild().binaryHash.slice(0,12),results=[];
const snapshot=(s,past)=>({...s,recentPawnSquares:past.filter(p=>p.turn===s.turn).slice(-4).map(p=>p.p[s.turn].y*9+p.p[s.turn].x)});
for(const ply of [41,49])for(const warm of [false,true]){
 const process=new NativeProcess({executable:pressureExecutable,profile:'candidate',env});let active=null;
 const engine={native:{info:{engineInfo:{build}}},cancel(){if(active)process.cancel(active);},async search(state,o){const id=randomUUID();active=id;try{return await process.search({...state,wallStreak:o.wallStreak??0,defenseReply:o.defenseReply??null},{...o,id,maxDepth:4});}finally{if(active===id)active=null;}}};
 const i=ply-1,source=snapshot(states[i],states.slice(0,i)),options={wallStreak:wallStreak(game.records.slice(0,i),0,0),defenseReply:null};
 let ponder,job,hit;
 try{
  if(warm){
   ponder=new ScreenPonder();job=ponder.start(engine,snapshot(states[i-1],states.slice(0,i-1)),{valid:()=>true,prepare:child=>({state:snapshot(child,states.slice(0,i-1)),options})});
   for(let n=0;n<80;n++){await new Promise(r=>setTimeout(r,50));hit=ponder.take(engine,source,options);if(hit?.depth>=4||!ponder.running)break;}
   ponder.stop();await job;
  }
  const r=await engine.search(source,{...options,ms:2500,cores:1});
  const row={ply,warm,seedMatched:!!hit,seedDepth:hit?.depth??null,completedDepth:r.depth,requestedDepth:4,action:notation(r.pv[0]),score:r.score,ms:r.elapsedMs};results.push(row);console.log(JSON.stringify(row));
 }finally{ponder?.stop({clear:true});process.close();await job;}
}
fs.mkdirSync('reports/game8-race-verification',{recursive:true});fs.writeFileSync('reports/game8-race-verification/ponder-pairs.json',JSON.stringify({build,conditions:'New process per branch, one worker, maximum depth4 and2500ms foreground. Warm branch uses ScreenPonder at maximum depth4. Compare only matching completed depths. This is a small controlled experiment, not a strength gate.',results},null,2));
