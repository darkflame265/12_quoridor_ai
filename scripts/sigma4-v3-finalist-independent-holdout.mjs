import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
import {chooseWeightedReplyV5} from './sigma4-reply-search-v5.mjs';

const outcome='evaluation/sigma4-v3-separated-candidates-audit-20261106.json';
const outfile='evaluation/sigma4-v3-finalist-independent-holdout-20261106.json';
const audit=JSON.parse(readFileSync(outcome,'utf8'));
assert.equal(audit.completeGames,64);
const eligible=Object.entries(audit.pairwise).filter(([variant,score])=>
 score.candidateCanAdvance&&
 audit.outcomes[variant].versusSigma2.wins>=audit.outcomes.baseline.versusSigma2.wins&&
 audit.outcomes[variant].versusSigma3.wins>=audit.outcomes.baseline.versusSigma3.wins)
 .sort((a,b)=>(b[1].improved-b[1].regressed)-(a[1].improved-a[1].regressed)||
 audit.latency[a[0]].p95Ms-audit.latency[b[0]].p95Ms);
const finalist=eligible[0]?.[0]??null;
const source=JSON.parse(readFileSync('evaluation/sigma4-diverse-strong-midgame-bank-20261106.json','utf8'));
const fixtures=source.positions.slice(-3);
assert.equal(fixtures.length,3);
const screened=JSON.parse(readFileSync('evaluation/sigma4-v3-candidate-paired-pilot-20261106.json','utf8'));
assert(fixtures.every(p=>!screened.config.fixtures.some(f=>f.id===p.id)));

const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const files=['server/sigma4-process.mjs','scripts/sigma4-bitset-wall-worker.py',
 'scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py',
 'scripts/sigma4-weighted-research-choice.mjs','scripts/sigma4-safe-original-v3.mjs',
 'scripts/sigma4-reply-search-v5.mjs','vendor/sigma-quoridor/models/best.onnx'];
const versions=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const config={version:'sigma4-v3-independent-holdout-if-pilot-pass-v1',
 pilotAuditSha256:createHash('sha256').update(readFileSync(outcome)).digest('hex'),
 finalist,fixtures:fixtures.map(p=>({id:p.id,positionId:p.positionId,actions:p.actions})),
 sourceSha256:versions,variants:finalist?['baseline',finalist]:[],
 opponents:['sigma2','sigma3'],seats:[0,1],simulations:200,maxPlies:200,
 note:'Holdout policy only chosen from pilot results; no holdout game played if promotion gate fails'};
const tasks=fixtures.flatMap(f=>config.opponents.flatMap(op=>config.seats.flatMap(seat=>config.variants.map(variant=>({fixture:f.id,opponent:op,seat,variant})))));
let report={config,games:[]};
if(existsSync(outfile)){
 const prev=JSON.parse(readFileSync(outfile,'utf8'));
 assert.deepEqual(prev.config,config,'changed holdout settings');report=prev;
}
if(!finalist){
 report.summary={decision:'NO_FINALIST',reason:'None passed non-decreasing opponent wins, positive paired pilot and non-increasing p95',matchesRun:0,productionPromotionApproved:false};
 writeFileSync(outfile,JSON.stringify(report,null,2)+'\n');
 console.log('HOLDOUT SKIPPED: no candidate passed pilot gate');process.exit(0);
}
const opts={rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06};
const cautious={...opts,rate:.55,temperature:.9,qTemperature:.12,maxQDrop:.10};
const prodRand=state=>{
 const str=JSON.stringify([state.p,state.walls,state.left,state.turn,state.historyStates?.length??0]);
 let n=2166136261;for(let i=0;i<str.length;i++)n=Math.imul(n^str.charCodeAt(i),16777619)>>>0;
 return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};
};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const workers={candidate:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})};
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(let i=report.games.length;i<tasks.length;i++){
  const t=tasks[i],f=fixtures.find(x=>x.id===t.fixture);
  let s=initial(),history=[],actions=[],timings=[];
  for(const a of f.actions){assert(legal(s,a));history.push(clone(s));actions.push(a);s=apply(s,a);}
  assert.equal(s.winner,null);
  while(s.winner===null&&actions.length<config.maxPlies){
   const candidate=s.turn===t.seat;
   const context={...s,historyStates:history.slice(-48),ply:actions.length};
   const start=performance.now();
   const raw=await (candidate?workers.candidate:workers[t.opponent]).search(context);
   let chosen=raw.pv?.[0];assert(chosen&&legal(s,chosen));
   if(candidate){
    const rand=prodRand(context);
    const choice=t.variant==='baseline'?chooseWeightedResearchCandidate(s,raw,rand,opts):
     t.variant==='safety-v3'?chooseWeightedTacticalV3(s,raw,rand,opts):
     t.variant==='conservative-weights'?chooseWeightedResearchCandidate(s,raw,rand,cautious):
     await chooseWeightedReplyV5(s,raw,rand,next=>workers.candidate.search({
       ...next,historyStates:[...history.slice(-47),clone(s)],ply:actions.length+1
     }),{...opts,replyMargin:2});
    chosen=choice.action;timings.push(performance.now()-start);
    assert(chosen&&legal(s,chosen));
   }
   history.push(clone(s));actions.push(chosen);s=apply(s,chosen);
  }
  const game={...t,candidateWon:s.winner===t.seat,winner:s.winner,cutoff:s.winner===null,
   totalPlies:actions.length,timings,actionsHash:sha(actions),actions};
  report.games.push(game);writeFileSync(outfile,JSON.stringify(report)+'\n');
  console.log('BLIND FINAL',i+1,'/',tasks.length,t.fixture,t.opponent,t.seat,t.variant,'win',game.candidateWon,'cutoff',game.cutoff);
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()));}
const pair=[];
for(const f of fixtures)for(const op of config.opponents)for(const seat of config.seats){
 const games=report.games.filter(x=>x.fixture===f.id&&x.opponent===op&&x.seat===seat);
 assert.equal(games.length,2);
 const orig=games.find(x=>x.variant==='baseline'),updated=games.find(x=>x.variant===finalist);
 assert(orig&&updated);
 for(const g of games){
  let state=initial();for(const action of g.actions){assert(legal(state,action));state=apply(state,action);}
  assert.equal(state.winner,g.winner);assert(!g.cutoff);
 }
 pair.push({fixture:f.id,opponent:op,seat,baselineWon:orig.candidateWon,
  finalistWon:updated.candidateWon,improved:!orig.candidateWon&&updated.candidateWon,
  regressed:orig.candidateWon&&!updated.candidateWon});
}
const sorted=variant=>report.games.filter(x=>x.variant===variant).flatMap(x=>x.timings).sort((a,b)=>a-b);
const stats=variant=>{const v=sorted(variant);return{moves:v.length,p95Ms:v[Math.ceil(v.length*.95)-1],over500:v.filter(x=>x>500).length};};
report.summary={decision:'FINALIST_EVALUATED',finalist,matchedGames:pair.length,
 improvements:pair.filter(x=>x.improved).length,regressions:pair.filter(x=>x.regressed).length,
 baselineWins:pair.filter(x=>x.baselineWon).length,finalistWins:pair.filter(x=>x.finalistWon).length,
 timing:{baseline:stats('baseline'),finalist:stats(finalist)},
 paired:pair,productionPromotionApproved:false,
 rationale:'Only 3 independent final-start groups; promotion requires stronger evidence than a small pilot and a short holdout'};
writeFileSync(outfile,JSON.stringify(report)+'\n');
console.log('HOLDOUT SUMMARY',JSON.stringify(report.summary));
