import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,moves,validWall} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';

const positions=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const path='evaluation/sigma4-unseen-wall-deep-20261105.json';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourcePaths=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma4-budget-process.mjs','vendor/sigma-quoridor/models/best.onnx'];
const sources=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const config={version:'sigma4-unseen-200-vs-400-validation-v1',
 seed:20261105,openingPositionsSha:sha(positions.map(p=>({id:p.id,seed:p.seed,positionId:p.positionId}))),
 budgets:[200,400],variant:'sigma3',treeReuse:false,
 diagnosticNote:'Both searches use identical original ONNX weights; 400-sim MCTS is a correlated reference, NOT ground truth',
 sourceSha256:sources,expected:positions.length};
let output={config,rows:[]};
if(existsSync(path)){
 const previous=JSON.parse(readFileSync(path,'utf8'));
 assert.deepEqual(previous.config,config,'resume code/source/config mismatch');
 output=previous;
}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261105'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const baseline=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
await baseline.health();
process.env.SIGMA3_RESEARCH_SIMS='400';
const deeper=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
await deeper.health();
delete process.env.SIGMA3_RESEARCH_SIMS;
const canonical=s=>JSON.stringify(s);
try{
 for(let i=output.rows.length;i<positions.length;i++){
  const p=positions[i];
  let s=initial(),history=[];
  for(const move of p.actions){
   assert(legal(s,move),'illegal generated trajectory');
   history.push(clone(s));s=apply(s,move);
  }
  assert.equal(s.winner,null);
  assert.equal(canonical(s),canonical(p.state));
  const state={...s,historyStates:history.slice(-48)};
  const t=performance.now();
  const small=await baseline.search(state);
  const mid=performance.now();
  const big=await deeper.search(state);
  const end=performance.now();
  assert.equal(small.simulations,200,'200 root mismatch');
  assert.equal(big.simulations,400,'400 root mismatch');
  assert(Math.abs(small.value-big.value)<1e-6,'network changed value at same state');
  assert(legal(s,small.pv[0])&&legal(s,big.pv[0]));
  const pick=r=>({action:r.pv[0],modelValue:r.value,rootQ:r.diagnostics.rootChildren[0]?.qFromRoot??null,
   bestAction:r.diagnostics.rootChildren[0]?.action??null,visits:r.diagnostics.rootChildren[0]?.visits??null,
   top3:r.diagnostics.rootChildren.slice(0,3).map(c=>({action:c.action,visits:c.visits,q:c.qFromRoot})),
   workerMs:r.elapsedMs,inferenceCache:r.inferenceCache});
  const a=pick(small),b=pick(big);
  const row={id:p.id,split:p.split,groupId:p.groupId,seed:p.seed,ply:p.ply,wallCount:p.wallCount,
   positionId:p.positionId,modelValue:small.value,networkProbability:(small.value+1)/2,
   search200:a,search400:b,actionAgrees:canonical(a.action)===canonical(b.action),
   qShift:b.rootQ-a.rootQ,modelVsSearchQ:b.rootQ-small.value,
   search200WallMs:mid-t,search400WallMs:end-mid,
   stableSign:a.rootQ!==null&&b.rootQ!==null&&Math.sign(a.rootQ)===Math.sign(b.rootQ)};
  output.rows.push(row);
  writeFileSync(path,JSON.stringify(output)+'\n');
  console.log('SEARCH',i+1,'/',positions.length,p.split,'walls',p.wallCount,
   '200',Math.round(row.search200WallMs),'400',Math.round(row.search400WallMs),
   'Q',Number(a.rootQ).toFixed(2),Number(b.rootQ).toFixed(2),
   'same',row.actionAgrees);
 }
}finally{await Promise.all([baseline.close(),deeper.close()]);}
const summarize=rows=>{
 const mean=arr=>arr.reduce((s,x)=>s+x,0)/arr.length;
 const q=arr=>[...arr].sort((a,b)=>a-b)[Math.ceil(arr.length*.95)-1];
 return {positions:rows.length,actionAgreements:rows.filter(r=>r.actionAgrees).length,
  stableValueSigns:rows.filter(r=>r.stableSign).length,
  meanAbsRootQShift:mean(rows.map(r=>Math.abs(r.qShift))),
  meanAbsNetworkVsDeepRootQ:mean(rows.map(r=>Math.abs(r.modelVsSearchQ))),
  mean200Ms:mean(rows.map(r=>r.search200WallMs)),mean400Ms:mean(rows.map(r=>r.search400WallMs)),
  p95_400Ms:q(rows.map(r=>r.search400WallMs)),max400Ms:Math.max(...rows.map(r=>r.search400WallMs))};
};
output.summary={all:summarize(output.rows),development:summarize(output.rows.filter(r=>r.split==='development')),holdout:summarize(output.rows.filter(r=>r.split==='holdout'))};
const suspicious=output.rows.filter(r=>r.stableSign&&Math.abs(r.modelVsSearchQ)>=.6)
 .sort((a,b)=>Math.abs(b.modelVsSearchQ)-Math.abs(a.modelVsSearchQ));
output.reviewDevelopmentOnly=suspicious.filter(r=>r.split==='development').slice(0,12).map(r=>({id:r.id,positionId:r.positionId,networkValue:r.modelValue,search200Q:r.search200.rootQ,search400Q:r.search400.rootQ,confidenceGap:r.modelVsSearchQ}));
writeFileSync(path,JSON.stringify(output)+'\n');
console.log('SUMMARY',JSON.stringify(output.summary),'REVIEWS',JSON.stringify(output.reviewDevelopmentOnly));
