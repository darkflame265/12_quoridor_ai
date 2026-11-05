import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedTempoV7} from './sigma4-tempo-guard-v7.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
import {chooseVerifiedTwoTurnV8} from './sigma4-verified-two-turn-v8.mjs';

const M=(x,y)=>({type:'move',x,y}),W=(x,y,o)=>({type:'wall',x,y,o});
const fixtures=[
 {id:'v7-blind-alpha-20261105',actions:[M(4,7),M(4,1),W(2,4,'h'),M(5,1),M(3,7),W(5,4,'v')]},
 {id:'v7-blind-beta-20261105',actions:[M(4,7),M(4,1),M(5,7),M(3,1),W(6,5,'h'),W(1,4,'v')]}
];
const previous=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const known=[...previous.fixtures];
for(const f of fixtures){
 if(known.some(x=>JSON.stringify(x.actions)===JSON.stringify(f.actions)))throw Error('training fixture repeated '+f.id);
 let s=initial();for(const a of f.actions){if(!legal(s,a))throw Error('illegal fixture '+f.id);s=apply(s,a);}
 if(s.winner!==null||s.turn!==0)throw Error('bad fixture turn '+f.id);
}
const opponents=['sigma3'];
const variants=['v8'];
const tasks=opponents.flatMap(opponent=>fixtures.flatMap(f=>[0,1].flatMap(candidateSide=>variants.map(variant=>({opponent,fixture:f.id,candidateSide,variant})))));
const sourceHashes=Object.fromEntries(['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','scripts/sigma4-weighted-research-choice.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const options=previous.settings.rootChoice;
const settings={fixtures,opponents,variants,policy:options,maxPlies:200,candidateSimulations:{v8:200},opponentSimulations:200,treeReuse:false,exploration:0,sourceHashes};
const out='evaluation/sigma4-v8-holdout-vs-sigma3-20261105.json';
const report={version:'sigma4-v8-sigma3-holdout-v1',settings,games:[]};
if(existsSync(out)){const p=JSON.parse(readFileSync(out));if(JSON.stringify(p.settings)!==JSON.stringify(settings))throw Error('resume mismatch');report.games=p.games;}
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
const agents={
 v8:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 original200:new SigmaProcess({variant:'sigma3',simulations:200}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})
};
function summary(arr){if(!arr.length)return null;const sorted=[...arr].sort((a,b)=>a-b);return {count:arr.length,mean:arr.reduce((a,b)=>a+b,0)/arr.length,median:sorted[Math.floor((arr.length-1)*.5)],p95:sorted[Math.ceil(arr.length*.95)-1],p99:sorted[Math.ceil(arr.length*.99)-1],max:sorted.at(-1),over500:arr.filter(n=>n>500).length};}
try{
 await Promise.all(Object.values(agents).map(x=>x.health()));
 for(let i=report.games.length;i<tasks.length;i++){
  const task=tasks[i],f=fixtures.find(x=>x.id===task.fixture);
  let state=initial(),history=[],actions=[],timings=[],cache={hits:0,misses:0},changed=0,tempoChanges=[];
  for(const a of f.actions){history.push(clone(state));state=apply(state,a);actions.push(a);}
  const seed=310013+fixtures.indexOf(f)*30011+opponents.indexOf(task.opponent)*101011+task.candidateSide*701;
  const crng=rng(seed),orng=rng(seed+19);
  while(state.winner===null&&actions.length<200){
   const candidate=state.turn===task.candidateSide,profile=candidate?task.variant:task.opponent;
   const worker=agents[profile==='weighted200'?'original200':profile];
   const start=performance.now();
   const raw=await worker.search({...state,historyStates:history.slice(-48)});
   const choice=candidate?chooseVerifiedTwoTurnV8(state,raw,crng,options):{action:raw.pv[0],changed:false,reason:'native-opponent'};
   const elapsed=performance.now()-start;
   if(!legal(state,choice.action))throw Error('illegal chosen action '+JSON.stringify(task));
   if(candidate){
    timings.push(elapsed);
    changed+=Number(!!choice.changed);
    if(choice.proofGate==='escaped')tempoChanges.push({ply:actions.length,priorAction:choice.rejected,action:choice.action,proof:choice.proof});
    if(raw.inferenceCache){cache.hits+=raw.inferenceCache.hits;cache.misses+=raw.inferenceCache.misses;}
   }
   history.push(clone(state));actions.push(choice.action);state=apply(state,choice.action);
  }
  const game={...task,seed,winner:state.winner,candidateWon:state.winner===task.candidateSide,cutoff:state.winner===null,plies:actions.length,changed,tempoChanges,latency:summary(timings),timingsMs:timings,cache,hash:hash(actions),actions};
  report.games.push(game);writeFileSync(out,JSON.stringify(report)+'\n');
  console.log('GAME',i+1,'/',tasks.length,task.opponent,task.variant,'seat',task.candidateSide,'won',game.candidateWon,'plies',game.plies,'meanMs',game.latency.mean.toFixed(1),'over500',game.latency.over500);
 }
}finally{await Promise.all(Object.values(agents).map(x=>x.close()));}
const overall={};
for(const op of opponents)for(const v of variants){
 const games=report.games.filter(g=>g.opponent===op&&g.variant===v);
 const t=games.flatMap(g=>g.timingsMs);
 overall[op+':'+v]={games:games.length,wins:games.filter(g=>g.candidateWon).length,losses:games.filter(g=>!g.candidateWon&&!g.cutoff).length,cutoffs:games.filter(g=>g.cutoff).length,latency:summary(t),cache:{hits:games.reduce((s,g)=>s+g.cache.hits,0),misses:games.reduce((s,g)=>s+g.cache.misses,0)}};
}
report.summary=overall;writeFileSync(out,JSON.stringify(report)+'\n');
console.log('SUMMARY',JSON.stringify(overall));
