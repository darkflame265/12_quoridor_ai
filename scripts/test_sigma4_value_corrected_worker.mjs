import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';

const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const rootRefs=JSON.parse(readFileSync('evaluation/sigma4-unseen-wall-deep-20261105.json')).rows;
const ids=['independent-wall-028','independent-wall-040','independent-wall-021'];
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
const oldAgent=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
const newAgent=new SigmaProcess({variant:'sigma3',simulations:200,correctedValue:true});
const rows=[];
try{
 await oldAgent.health();
 await newAgent.health();
 for(const id of ids){
  const p=bank.find(p=>p.id===id),ref=rootRefs.find(x=>x.id===id);
  let s=initial(),history=[];
  for(const a of p.actions){assert(legal(s,a));history.push(clone(s));s=apply(s,a);}
  const param={...s,ply:p.ply,historyStates:history.slice(-48)};
  const original=await oldAgent.search(param);
  const corrected=await newAgent.search(param);
  assert.equal(original.simulations,200);
  assert.equal(corrected.simulations,200);
  assert(legal(s,original.pv[0])&&legal(s,corrected.pv[0]));
  assert(Math.abs(original.value-corrected.value)<1e-6,'original base network altered');
  assert(Math.abs(original.value-ref.modelValue)<1e-6,'mismatch recorded original model');
  assert(Math.abs(corrected.correctionDiagnostics.rootRawValue-original.value)<1e-6);
  assert(corrected.correctionDiagnostics.correctionEvaluations>0&&corrected.correctionDiagnostics.correctionEvaluations<=202);
  assert(Math.abs(corrected.correctionDiagnostics.rootCorrectedValue-original.value)>.000001);
  const row={id,originalAction:original.pv[0],correctedAction:corrected.pv[0],
   rawValue:original.value,correctedRootValue:corrected.correctionDiagnostics.rootCorrectedValue,
   originalRootQ:original.diagnostics.rootChildren[0]?.qFromRoot,
   correctedRootQ:corrected.diagnostics.rootChildren[0]?.qFromRoot,
   originalWallMs:original.elapsedMs,correctedWallMs:corrected.elapsedMs,
   correctionEvaluations:corrected.correctionDiagnostics.correctionEvaluations,
   changedChoice:JSON.stringify(original.pv[0])!==JSON.stringify(corrected.pv[0])};
  rows.push(row);console.log('WORKER SMOKE',JSON.stringify(row));
 }
}finally{await Promise.all([oldAgent.close(),newAgent.close()]);}
writeFileSync('evaluation/sigma4-value-corrected-worker-smoke-20261106.json',
 JSON.stringify({version:'sigma4-research-corrected-worker-v1',rows,productionApproved:false},null,2)+'\n');
console.log('PASS research corrected worker');
