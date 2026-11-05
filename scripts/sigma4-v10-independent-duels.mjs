import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal,moves,validWall} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseSigma4WallStructureV10} from './sigma4-wall-structure-v10.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const rngFor=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;}};
const fixtures=[];
for(let i=0;i<6;i++){
 const random=rngFor(991107+7919*i);
 let state=initial();
 const actions=[],plyLimit=8+(i%3)*2;
 for(let ply=0;ply<plyLimit;ply++){
  const pawns=moves(state);
  const walls=[];
  if(state.left[state.turn]>0)for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
   const a={type:'wall',x,y,o};
   if(validWall(state,a))walls.push(a);
  }
  const chooseWall=walls.length>0&&random()<(.38+(i%2)*.16);
  const pool=chooseWall?walls:pawns;
  const a=pool[Math.floor(random()*pool.length)];
  if(!a||!legal(state,a))throw Error('cannot construct legal fixture');
  actions.push(a);state=apply(state,a);
  if(state.winner!==null)throw Error('fixture unexpectedly ended');
 }
 if(state.turn!==0)throw Error('fixture needs candidate-turn orientation');
 fixtures.push({id:'v10-blind-'+String(i+1).padStart(2,'0')+'-20261105',actions});
}
const previous=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const known=[...previous.fixtures];
for(const f of fixtures){
 if(known.some(x=>JSON.stringify(x.actions)===JSON.stringify(f.actions)))throw Error('training fixture repeated '+f.id);
 let s=initial();for(const a of f.actions){if(!legal(s,a))throw Error('illegal fixture '+f.id);s=apply(s,a);}
 if(s.winner!==null||s.turn!==0)throw Error('bad fixture turn '+f.id);
}
const opponents=['sigma2','sigma3'];
const variants=['v3','v10'];
const tasks=opponents.flatMap(opponent=>fixtures.flatMap(f=>[0,1].flatMap(candidateSide=>variants.map(variant=>({opponent,fixture:f.id,candidateSide,variant})))));
const sourceHashes=Object.fromEntries(['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','scripts/sigma4-weighted-research-choice.mjs','scripts/sigma4-wall-structure-v10.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const options=previous.settings.rootChoice;
const settings={fixtures,opponents,variants,policy:options,maxPlies:200,candidateSimulations:{v3:200,v10:200},wallScoreMargin:1,opponentSimulations:200,treeReuse:false,exploration:0,sourceHashes};
const out='evaluation/sigma4-v10-independent-sigma23-20261105.json';
const report={version:'sigma4-v10-independent-sigma23-v1',settings,games:[]};
if(existsSync(out)){const p=JSON.parse(readFileSync(out));if(JSON.stringify(p.settings)!==JSON.stringify(settings))throw Error('resume mismatch');report.games=p.games;}
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
const agents={
 v10:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 v3:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 original200:new SigmaProcess({variant:'sigma3',simulations:200}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})
};
function summary(arr){if(!arr.length)return null;const sorted=[...arr].sort((a,b)=>a-b);return {count:arr.length,mean:arr.reduce((a,b)=>a+b,0)/arr.length,median:sorted[Math.floor((arr.length-1)*.5)],p95:sorted[Math.ceil(arr.length*.95)-1],p99:sorted[Math.ceil(arr.length*.99)-1],max:sorted.at(-1),over500:arr.filter(n=>n>500).length};}
try{
 await Promise.all(Object.values(agents).map(x=>x.health()));
 for(let i=report.games.length;i<tasks.length;i++){
  const task=tasks[i],f=fixtures.find(x=>x.id===task.fixture);
  let state=initial(),history=[],actions=[],timings=[],cache={hits:0,misses:0},changed=0,v10Statuses={},v10Interventions=[];
  for(const a of f.actions){history.push(clone(state));state=apply(state,a);actions.push(a);}
  const seed=310013+fixtures.indexOf(f)*30011+opponents.indexOf(task.opponent)*101011+task.candidateSide*701;
  const crng=rng(seed),orng=rng(seed+19);
  while(state.winner===null&&actions.length<200){
   const candidate=state.turn===task.candidateSide,profile=candidate?task.variant:task.opponent;
   const worker=agents[profile==='weighted200'?'original200':profile];
   const start=performance.now();
   const raw=await worker.search({...state,historyStates:history.slice(-48)});
   const choice=candidate?(task.variant==='v3'
     ?chooseWeightedTacticalV3(state,raw,crng,options)
     :chooseSigma4WallStructureV10(state,raw,crng,{...options,wallScoreMargin:1,wallMinQLead:0}))
     :{action:raw.pv[0],changed:false,reason:'native-opponent'};
   const elapsed=performance.now()-start;
   if(!legal(state,choice.action))throw Error('illegal chosen action '+JSON.stringify(task));
   if(candidate){
    timings.push(elapsed);
    changed+=Number(!!choice.changed);
    if(task.variant==='v10'){
     const status=choice.wallV10??'none';
     v10Statuses[status]=(v10Statuses[status]??0)+1;
     if(status==='replaced')v10Interventions.push({ply:actions.length,
       priorAction:choice.priorAction,action:choice.action,
       scoreGain:choice.gain,qLead:choice.qLead,native:choice.nativeMetric,sampled:choice.sampledMetric});
    }
    if(raw.inferenceCache){cache.hits+=raw.inferenceCache.hits;cache.misses+=raw.inferenceCache.misses;}
   }
   history.push(clone(state));actions.push(choice.action);state=apply(state,choice.action);
  }
  const game={...task,seed,winner:state.winner,candidateWon:state.winner===task.candidateSide,cutoff:state.winner===null,plies:actions.length,changed,v10Statuses,v10Interventions,latency:summary(timings),timingsMs:timings,cache,hash:hash(actions),actions};
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
