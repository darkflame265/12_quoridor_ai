import {initial,apply,legal,clone} from '../src/engine.js';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {SigmaProcess} from './sigma4-isolated-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedReplyV5} from './sigma4-reply-search-v5.mjs';
const M=(x,y)=>({type:'move',x,y}),W=(x,y,o)=>({type:'wall',x,y,o});
const fixtures=[
 {id:'fresh-pawn-flank-20261105',actions:[M(4,7),M(4,1),M(4,6),M(4,2),M(3,6),M(5,2)]},
 {id:'fresh-wall-flank-20261105',actions:[M(4,7),M(4,1),W(3,4,'h'),M(4,2),M(3,7),M(5,2)]},
];
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const originalData=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const holdoutData=JSON.parse(readFileSync('evaluation/sigma4-v2-holdout-fixtures.json'));
const existingKeys=new Set([...originalData.fixtures,...holdoutData.fixtures].map(f=>JSON.stringify(f.actions)));
for(const f of fixtures){
 if(existingKeys.has(JSON.stringify(f.actions)))throw Error('fixture previously used');
 let state=initial();for(const a of f.actions){if(!legal(state,a))throw Error('illegal fixture '+f.id+' '+JSON.stringify(a));state=apply(state,a);}
 if(state.winner!==null||state.turn!==0)throw Error('invalid fixture ending');
}
const settings={simulations:200,maxPlies:200,deterministic:true,reuse:false,rootChoice:{rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06},fixtures,variants:['original','reply-v5'],opponents:['sigma3']};
const out='evaluation/sigma4-reply-v5-paired-screen-20261105.json';
const provenance={sigma2:hash(readFileSync('scripts/sigma2-baseline-worker.py','utf8')),sigma3:hash(readFileSync('scripts/sigma-inference-worker.py','utf8')),original:hash(readFileSync('scripts/sigma4-weighted-research-choice.mjs','utf8')),safe:hash(readFileSync('scripts/sigma4-reply-search-v5.mjs','utf8'))};
const tasks=settings.opponents.flatMap(opponent=>fixtures.slice(0,1).flatMap(f=>[0,1].flatMap(candidateSide=>settings.variants.map(variant=>({opponent,fixture:f.id,candidateSide,variant})))));
let report={version:'sigma4-reply-v5-paired-screen-v1',settings,provenance,planned:tasks.length,games:[]};
if(existsSync(out)){const prev=JSON.parse(readFileSync(out,'utf8'));if(JSON.stringify(prev.settings)!==JSON.stringify(settings)||JSON.stringify(prev.provenance)!==JSON.stringify(provenance))throw Error('resume mismatch');report.games=prev.games;}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261105'});
const agents={sigma2:new SigmaProcess({variant:'sigma2'}),sigma3:new SigmaProcess({variant:'sigma3'}),candidate:new SigmaProcess({variant:'sigma3'})};
const rngFor=seed=>{let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;}};
try{
 for(let i=report.games.length;i<tasks.length;i++){
  const task=tasks[i],fixture=fixtures.find(f=>f.id===task.fixture);
  const seed=450011+fixtures.indexOf(fixture)*8191+settings.opponents.indexOf(task.opponent)*100003;
  const rng=rngFor(seed);
  let s=initial(),history=[],actions=[],changed=0,saved=0,causes={},timeMs=0;
  for(const a of fixture.actions){history.push(clone(s));actions.push(a);s=apply(s,a);}
  for(let ply=6;ply<200&&s.winner===null;ply++){
   const candidate=s.turn===task.candidateSide,worker=agents[candidate?'candidate':task.opponent];
   const raw=await worker.search({...s,historyStates:history.slice(-48)});
   const native=raw.pv?.[0];if(!native||!legal(s,native))throw Error('illegal native');
   const decision=candidate?(task.variant==='original'?chooseWeightedResearchCandidate(s,raw,rng,settings.rootChoice):await chooseWeightedReplyV5(s,raw,rng,next=>agents.candidate.search({...next,historyStates:[...history.slice(-47),clone(s)]}),settings.rootChoice)):null;
   const chosen=decision?.action??native;
   if(!legal(s,chosen))throw Error('illegal chosen');
   changed+=Number(!!decision?.changed);
   if(decision?.reason?.includes('prevent-')||decision?.reason?.includes('defense'))saved++;
   if(candidate)causes[decision.reason]=(causes[decision.reason]||0)+1;
   history.push(clone(s));actions.push(chosen);s=apply(s,chosen);timeMs+=raw.elapsedMs||0;
  }
  const game={...task,seed,winner:s.winner,candidateWon:s.winner===task.candidateSide,cutoff:s.winner===null,plies:actions.length,
   fullHash:hash(actions),changed,saved,reasons:causes,moveSequence:actions,elapsedTotalMs:timeMs};
  report.games.push(game);writeFileSync(out,JSON.stringify(report)+'\n');
  const batch=report.games.filter(g=>g.opponent===task.opponent&&g.variant===task.variant);
  console.log('GAME',i+1,'/',tasks.length,task.opponent,task.variant,'seat',task.candidateSide,'W',batch.filter(g=>g.candidateWon).length,'L',batch.filter(g=>!g.candidateWon&&!g.cutoff).length,'changed',changed,'saved',saved);
 }
}finally{await Promise.all(Object.values(agents).map(x=>x.close()));}
console.log('SUMMARY',JSON.stringify(settings.opponents.flatMap(opponent=>settings.variants.map(variant=>{const g=report.games.filter(x=>x.opponent===opponent&&x.variant===variant);return {opponent,variant,wins:g.filter(x=>x.candidateWon).length,losses:g.filter(x=>!x.candidateWon).length,unique:new Set(g.map(x=>x.fullHash)).size,saved:g.reduce((s,x)=>s+x.saved,0)};}))));
