import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';

const rows=JSON.parse(readFileSync('evaluation/sigma4-unseen-wall-deep-20261105.json','utf8')).rows;
const positions=Object.fromEntries(readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse).map(x=>[x.id,x]));
const scored=rows.filter(x=>x.split==='development').map(x=>({row:x,score:Math.abs(x.modelVsSearchQ)+(x.actionAgrees?0:.2)}))
 .sort((a,b)=>b.score-a.score).slice(0,8).map(x=>x.row);
const output={version:'sigma4-discrepant-search-800-v1',searchSimulations:800,source:'evaluation/sigma4-unseen-wall-deep-20261105.json',results:[]};
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261105',SIGMA3_RESEARCH_SIMS:'800'});
const agent=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
try{
 await agent.health();
 for(const row of scored){
  const p=positions[row.id];let s=initial(),history=[];
  for(const a of p.actions){assert(legal(s,a));history.push(clone(s));s=apply(s,a);}
  const r=await agent.search({...s,historyStates:history.slice(-48)});
  assert.equal(r.simulations,800);
  assert(legal(s,r.pv[0]));
  assert(Math.abs(r.value-row.modelValue)<1e-6);
  const root=r.diagnostics.rootChildren[0];
  output.results.push({id:row.id,positionId:row.positionId,modelValue:r.value,
   q200:row.search200.rootQ,q400:row.search400.rootQ,q800:root.qFromRoot,
   best200:row.search200.action,best400:row.search400.action,best800:r.pv[0],
   same200_400:row.actionAgrees,
   same400_800:JSON.stringify(row.search400.action)===JSON.stringify(r.pv[0]),
   visited800:root.visits,elapsedMs:r.elapsedMs});
  writeFileSync('evaluation/sigma4-unseen-wall-800-review-20261105.json',JSON.stringify(output,null,2)+'\n');
  console.log('800 REVIEW',row.id,'NN',r.value.toFixed(2),'Q200',row.search200.rootQ.toFixed(2),
   'Q400',row.search400.rootQ.toFixed(2),'Q800',root.qFromRoot.toFixed(2),'same400',output.results.at(-1).same400_800);
 }
}finally{await agent.close();}
output.summary={count:output.results.length,same400_800:output.results.filter(r=>r.same400_800).length,
 note:'All budgets reuse same model: cannot label disagreement as an objective neural evaluation error'};
writeFileSync('evaluation/sigma4-unseen-wall-800-review-20261105.json',JSON.stringify(output,null,2)+'\n');
console.log('SUMMARY',JSON.stringify(output.summary));
