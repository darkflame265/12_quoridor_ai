import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal,clone} from '../src/engine.js';
import {SigmaProcess} from './sigma4-isolated-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseAdaptiveWeightedCandidate} from './sigma4-adaptive-weighted-v2.mjs';
const fixtureFile='evaluation/sigma4-v2-holdout-fixtures.json',all=JSON.parse(readFileSync(fixtureFile,'utf8'));
const fixtures=all.fixtures.slice(0,4);
const OUT='evaluation/sigma4-v2-holdout-duels-20261105.json',opponents=['sigma2','sigma3'],variants=['original','adaptive-v2'];
const tasks=opponents.flatMap(opponent=>fixtures.flatMap(f=>[0,1].flatMap(candidateSide=>variants.map(variant=>({opponent,fixture:f.id,candidateSide,variant})))));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const settings={sims:200,maxPlies:200,deterministic:true,reuse:false,pairedVariants:true,pairedSeats:true,
 original:{rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06},
 adaptive:{baseRate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.065,minVisits:10,minVisitRatio:.18,maxOverrides:3,dangerDistance:3,maxWallValueDrop:.035}};
const provenance={sigma2:hash(readFileSync('scripts/sigma2-baseline-worker.py','utf8')),sigma3:hash(readFileSync('scripts/sigma-inference-worker.py','utf8')),original:hash(readFileSync('scripts/sigma4-weighted-research-choice.mjs','utf8')),adaptive:hash(readFileSync('scripts/sigma4-adaptive-weighted-v2.mjs','utf8')),fixtures:hash(readFileSync(fixtureFile,'utf8'))};
let report={version:'sigma4-weighted-original-vs-v2-new-fixtures-paired-v1',settings,provenance,fixtures,planned:tasks.length,games:[]};
if(existsSync(OUT)){let old=JSON.parse(readFileSync(OUT,'utf8'));if(old.version!==report.version||JSON.stringify(old.provenance)!==JSON.stringify(provenance)||JSON.stringify(old.settings)!==JSON.stringify(settings))throw Error('holdout resume changed');report.games=old.games;}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261105'});
const agents={sigma2:new SigmaProcess({variant:'sigma2'}),sigma3:new SigmaProcess({variant:'sigma3'}),candidate:new SigmaProcess({variant:'sigma3'})};
const randomSeed=(seed)=>{let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};};
try{
 for(let i=report.games.length;i<tasks.length;i++){
  const task=tasks[i],fixture=fixtures.find(f=>f.id===task.fixture),rng=randomSeed(30261105+fixtures.indexOf(fixture)*8191+opponents.indexOf(task.opponent)*100003);
  let state=initial(),history=[],moves=[],changed=0;
  for(const action of fixture.actions){if(!legal(state,action))throw Error('invalid fixture');history.push(clone(state));state=apply(state,action);moves.push(action);}
  for(let ply=6;ply<settings.maxPlies&&state.winner===null;ply++){
   const isCandidate=state.turn===task.candidateSide;
   const res=await agents[isCandidate?'candidate':task.opponent].search({...state,historyStates:history.slice(-48)});
   const native=res.pv?.[0];if(!native||!legal(state,native))throw Error('invalid native move');
   const selected=isCandidate?(task.variant==='original'?
    chooseWeightedResearchCandidate(state,res,rng,settings.original):
    chooseAdaptiveWeightedCandidate(state,res,rng,{...settings.adaptive,overrides:changed})):null;
   const action=selected?.action??native;
   if(!legal(state,action))throw Error('invalid selected move');
   if(selected?.changed)changed++;
   history.push(clone(state));moves.push(action);state=apply(state,action);
  }
  const game={...task,winner:state.winner,cutoff:state.winner===null,candidateWon:state.winner===task.candidateSide,
   changed,plies:moves.length,sequenceHash:hash(moves),moves};
  report.games.push(game);writeFileSync(OUT,JSON.stringify(report)+'\n');
  const rows=report.games.filter(x=>x.opponent===task.opponent&&x.variant===task.variant);
  console.log('HOLDOUT',i+1,'/',tasks.length,task.opponent,task.fixture,task.candidateSide,task.variant,
   game.candidateWon?'win':game.cutoff?'cutoff':'loss','score',rows.filter(g=>g.candidateWon).length+'-'+rows.filter(g=>!g.candidateWon&&!g.cutoff).length,
   'changed',changed);
 }
}finally{await Promise.all(Object.values(agents).map(a=>a.close()));}
console.log('FINAL',JSON.stringify(opponents.flatMap(opponent=>variants.map(variant=>{let x=report.games.filter(g=>g.opponent===opponent&&g.variant===variant);return {opponent,variant,games:x.length,wins:x.filter(g=>g.candidateWon).length,losses:x.filter(g=>!g.candidateWon&&!g.cutoff).length,unique:new Set(x.map(g=>g.sequenceHash)).size}}))));
