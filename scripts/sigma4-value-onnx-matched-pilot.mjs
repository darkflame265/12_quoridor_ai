import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const ids=[21,25,37,41].map(x=>'independent-wall-'+String(x).padStart(3,'0'));
const starts=ids.map(id=>bank.find(x=>x.id===id));
assert(starts.every(x=>x?.split==='holdout'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json')).settings.rootChoice;
const variants=['original','corrected'],opponents=['sigma2','sigma3'],sides=[0,1];
const sourceFiles=[
 'scripts/sigma4-bitset-wall-worker.py','scripts/sigma4-value-residual-worker.py','scripts/sigma4-budget-process.mjs',
 'scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','scripts/sigma4-safe-original-v3.mjs',
 'vendor/sigma-quoridor/models/best.onnx','evaluation/sigma4-value-residual-research-20261106.onnx'];
const config={version:'sigma4-value-research-onnx-matched-pilot-v1',starts:starts.map(p=>({
 id:p.id,positionId:p.positionId,split:p.split,seed:p.seed,ply:p.ply})),
 candidateVariants:variants,opponents,sides,rootChoice,simulations:200,maxPlies:200,
 seedBase:20261106,sourceHashes:Object.fromEntries(sourceFiles.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')])),
 caveat:'Four training-disjoint starting positions only, also previously used for diagnostic evaluation; not a blind promotion tournament'};
const tasks=starts.flatMap(p=>opponents.flatMap(op=>sides.flatMap(side=>variants.map(variant=>({id:p.id,op,side,variant})))));
const out='evaluation/sigma4-value-research-onnx-matched-pilot-20261106.json';
let result={config,games:[]};
if(existsSync(out)){
 const old=JSON.parse(readFileSync(out,'utf8'));assert.deepEqual(old.config,config,'resume source/config mismatch');result=old;
}
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const agent={
 original:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 corrected:new SigmaProcess({variant:'sigma3',simulations:200,correctedValue:true}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})
};
try{
 await Promise.all(Object.values(agent).map(a=>a.health()));
 for(let i=result.games.length;i<tasks.length;i++){
  const t=tasks[i],p=starts.find(x=>x.id===t.id);
  let s=initial(),actions=[],history=[];
  for(const a of p.actions){assert(legal(s,a));history.push(clone(s));actions.push(a);s=apply(s,a);}
  assert.deepEqual(s,p.state);
  const policySeed=config.seedBase+p.seed*17+t.side*1717+(t.op==='sigma2'?101:202);
  const random=rng(policySeed),timings=[],correctionEvaluationCounts=[];
  let candidates=0,firstCandidate=null;
  const start=performance.now();
  while(s.winner===null&&actions.length<config.maxPlies){
   const candidate=s.turn===t.side;
   const worker=candidate?agent[t.variant]:agent[t.op];
   const state={...s,ply:actions.length,historyStates:history.slice(-48)};
   const before=performance.now();
   const raw=await worker.search(state);
   const after=performance.now();
   const action=candidate?chooseWeightedTacticalV3(s,raw,random,rootChoice).action:raw.pv[0];
   assert(action&&legal(s,action),'illegal action '+t.id+' ply '+actions.length);
   if(candidate){
    candidates++;timings.push(after-before);
    if(firstCandidate===null)firstCandidate={ply:actions.length,action,rawValue:raw.value,
      topQ:raw.diagnostics?.rootChildren?.[0]?.qFromRoot??null};
    if(t.variant==='corrected'){
     assert(raw.correctionDiagnostics&&raw.correctionDiagnostics.correctionEvaluations>0);
     correctionEvaluationCounts.push(raw.correctionDiagnostics.correctionEvaluations);
    }
   }
   history.push(clone(s));actions.push(action);s=apply(s,action);
  }
  const row={...t,policySeed,cutoff:s.winner===null,winner:s.winner,candidateWon:s.winner===t.side,
   totalPlies:actions.length,continuationPlies:actions.length-p.ply,candidateMoves:candidates,
   wallMs:performance.now()-start,candidateTimingsMs:timings,
   correctionEvaluationCounts,firstCandidate,
   actionsHash:sha(actions),actions};
  result.games.push(row);writeFileSync(out,JSON.stringify(result)+'\n');
  console.log('MODEL MATCH',i+1,'/',tasks.length,t.id,t.op,'seat',t.side,t.variant,
   'WIN',row.candidateWon,'moves',row.candidateMoves,'elapsed',Math.round(row.wallMs),'cutoff',row.cutoff);
 }
}finally{await Promise.all(Object.values(agent).map(a=>a.close()));}
result.summary={games:result.games.length,oldWins:result.games.filter(x=>x.variant==='original'&&x.candidateWon).length,
 newWins:result.games.filter(x=>x.variant==='corrected'&&x.candidateWon).length,
 cutoffCount:result.games.filter(x=>x.cutoff).length};
writeFileSync(out,JSON.stringify(result)+'\n');
console.log('MODEL PILOT SUMMARY',JSON.stringify(result.summary));
