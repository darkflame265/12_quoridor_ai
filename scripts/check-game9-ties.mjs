import fs from 'node:fs';
import assert from 'node:assert/strict';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {notation} from '../src/engine.js';
const cases=JSON.parse(fs.readFileSync('pressure-engine/test-data/tie-game9.json','utf8')),rows=[],cores=Number(process.argv[2]??1);
for(const c of cases){
 const pair=[];
 for(const variant of ['before','after']){
  const p=new NativeProcess({executable:variant==='before'?'.external/game9-before/pressure.exe':pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}});
  try{const r=await p.search(c.state,{ms:3000,cores,maxDepth:14});pair.push({variant,action:notation(r.pv[0]),score:r.score,exact:r.exact??false,outcome:r.outcome??null,depth:r.depth});if(variant==='after')assert.equal(r.pv[0].type,'move');}finally{p.close();}
 }
 assert.equal(pair[0].score,pair[1].score);assert.equal(pair[0].outcome,pair[1].outcome);
 rows.push({ply:c.ply,pair});console.log(JSON.stringify(rows.at(-1)));
}
fs.writeFileSync(`evaluation/game9-improvements/${cores===1?'ties.json':`ties-${cores}.json`}`,JSON.stringify({beforeBuild:'5792574660dd',afterBuild:verifyPressureBuild().binaryHash.slice(0,12),conditions:`Fresh process per version and case, ${cores} workers, max depth14 /3000ms; compare score and exact outcome before/after.`,rows},null,2));
