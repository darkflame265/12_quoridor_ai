import fs from 'node:fs';
import assert from 'node:assert/strict';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {legal,notation,apply} from '../src/engine.js';
const cases=JSON.parse(fs.readFileSync('pressure-engine/test-data/race-game11.json','utf8')),rows=[];
for(const c of cases){
 const pair=[];
 for(const variant of ['before','after']){
  const p=new NativeProcess({executable:variant==='before'?'.external/game11-before/pressure.exe':pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}});
  try{const r=await p.search(c.state,{ms:2000,cores:4,maxDepth:12});assert(legal(c.state,r.pv[0]));if(variant==='after'&&c.ply===22)assert.equal(r.pv[0].type,'move');pair.push({variant,action:notation(r.pv[0]),score:r.score,depth:r.depth,elapsedMs:r.elapsedMs,nodes:r.nodes,wallUtility:r.goalSafety?.wallUtility??null,pv:r.pv.map(notation)});}finally{p.close();}
 }
 rows.push({ply:c.ply,recordedAction:notation(c.action),pair});console.log(JSON.stringify(rows.at(-1)));
}
const replies=[],c=cases.find(c=>c.ply===22);
for(const action of [c.action,{type:'move',x:2,y:4}]){
 const p=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}});
 try{const {wallRun,wallStreak,recentPawnSquares,...state}=c.state;const r=await p.search(apply(state,action),{ms:2000,cores:4,maxDepth:4});replies.push({first:notation(action),depth:r.depth,scoreForUser:-r.score,reply:r.pv.map(notation)});}finally{p.close();}
}
console.log(JSON.stringify({forcedFirstAction:replies}));
fs.mkdirSync('evaluation/game11-improvements',{recursive:true});fs.writeFileSync('evaluation/game11-improvements/comparison.json',JSON.stringify({beforeBuild:'703b597e46fa',afterBuild:verifyPressureBuild().binaryHash.slice(0,12),conditions:'Fresh process for every variant and position; 4 workers, 2000ms /depth12 maximum. Different completed depths are reported, not treated as equal-depth proof. Forced first-action replies: fresh process, 4 workers, depth4 /2000ms, no invented opponent history. No complete game or winning strategy verification.',rows,replies},null,2));
