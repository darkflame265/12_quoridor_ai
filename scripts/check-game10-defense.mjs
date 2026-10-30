import fs from 'node:fs';
import assert from 'node:assert/strict';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {legal,notation} from '../src/engine.js';
const cases=JSON.parse(fs.readFileSync('pressure-engine/test-data/defense-game10.json','utf8'));
const rows=[];
for(const c of cases){
 const p=new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}});
 try{
  const r=await p.search(c.state,{ms:1800,cores:1,maxDepth:5});
  assert(legal(c.state,r.pv[0]));assert.equal(r.depth,5);
  if(c.ply===19){assert(r.threatDefense.focused?.complete);assert.equal(r.pv[0].type,'move');}
  if(c.ply===15){assert.equal(r.weakWallConsumption.selected?.defensiveException,false);assert(r.weakWallConsumption.selected?.penalty>0);}
  rows.push({ply:c.ply,previousPlayed:notation(c.action),action:notation(r.pv[0]),depth:r.depth,score:r.score,focused:r.threatDefense?.focused,weak:r.weakWallConsumption?.selected});
  console.log(JSON.stringify(rows.at(-1)));
 }finally{p.close();}
}
fs.mkdirSync('evaluation/game10-improvements',{recursive:true});
fs.writeFileSync('evaluation/game10-improvements/targeted.json',JSON.stringify({build:verifyPressureBuild().binaryHash.slice(0,12),conditions:'Fresh process per position; one worker; depth5 /1800ms. PreviousPlayed is the recorded move, not a controlled old-build result. Selective heuristic, not a winning proof.',rows},null,2));
