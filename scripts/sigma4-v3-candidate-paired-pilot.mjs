import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
import {chooseWeightedReplyV5} from './sigma4-reply-search-v5.mjs';
const sha=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const sources=[
 'server/sigma4-process.mjs','scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py',
 'scripts/sigma2-baseline-worker.py','scripts/sigma4-weighted-research-choice.mjs',
 'scripts/sigma4-safe-original-v3.mjs','scripts/sigma4-reply-search-v5.mjs',
 'vendor/sigma-quoridor/models/best.onnx'
];
const versions=Object.fromEntries(sources.map(f=>[f,createHash('sha256').update(readFileSync(f)).digest('hex')]));
const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const strong=JSON.parse(readFileSync('evaluation/sigma4-strong-selfplay-midgames-20261106.json','utf8')).openings;
const reference=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8')).settings.rootChoice;
const fixtures=[
 ...['independent-wall-028','independent-wall-040'].map(id=>{const p=bank.find(x=>x.id===id);assert(p);return{id,source:'old-hard-case',actions:p.actions};}),
 ...[2,7].map(i=>{const p=strong[i];assert(p);return{id:p.id,source:'strong-policy',actions:p.actions};})
];
const variants=['baseline','safety-v3','reply-v5','conservative-weights'];
const opponents=['sigma2','sigma3'];
const opts={rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06};
const cautious={...opts,rate:.55,temperature:.9,qTemperature:.12,maxQDrop:.10};
const config={version:'sigma4-v3-safe-reply-weights-paired-pilot-v1',fixtures,variants,opponents,
 sims:200,maxPlies:200,baseOptions:opts,conservativeOptions:cautious,seed:20261106,sourceSha256:versions,
 notes:['Comparison targets deployed weighted V3, not old bounded-3ply SIGMA4',
 'Same board/seat/opponent/seed for variants; subsequent random consumption can diverge',
 'Prior two historical failure boards are development fixtures, not blind test evidence',
 'Reply V5 adds an actual extra 200-MCTS search when root differs; may exceed 500ms']};
const tasks=fixtures.flatMap(f=>opponents.flatMap(op=>[0,1].flatMap(seat=>variants.map(v=>({fixture:f.id,opponent:op,seat,variant:v})))));
const out='evaluation/sigma4-v3-candidate-paired-pilot-20261106.json';
let result={config,games:[]};
if(existsSync(out)){const prior=JSON.parse(readFileSync(out,'utf8'));assert.deepEqual(prior.config,config,'resume source changed');result=prior;}
const productionRng=state=>{
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
 for(let i=result.games.length;i<tasks.length;i++){
  const t=tasks[i],f=fixtures.find(x=>x.id===t.fixture);
  let s=initial(),history=[],actions=[],candidateSamples=0;
  for(const a of f.actions){assert(legal(s,a));history.push(clone(s));actions.push(a);s=apply(s,a);}
  assert.equal(s.winner,null);
  const changes={},safetyChecks={changed:0,blocked:0},latencies=[];let first=null;
  while(s.winner===null&&actions.length<config.maxPlies){
   const candidate=s.turn===t.seat;
   const state={...s,historyStates:history.slice(-48),ply:actions.length};
   const begin=performance.now();
   const raw=await (candidate?workers.candidate:workers[t.opponent]).search(state);
   assert(raw.pv?.[0]&&legal(s,raw.pv[0]));
   let chosen=raw.pv[0];
   if(candidate){
    candidateSamples++;
    const rng=productionRng(state);
    let choice;
    if(t.variant==='baseline')choice=chooseWeightedResearchCandidate(s,raw,rng,opts);
    else if(t.variant==='safety-v3')choice=chooseWeightedTacticalV3(s,raw,rng,opts);
    else if(t.variant==='conservative-weights')choice=chooseWeightedResearchCandidate(s,raw,rng,cautious);
    else if(t.variant==='reply-v5'){
     choice=await chooseWeightedReplyV5(s,raw,rng,replyState=>workers.candidate.search({
       ...replyState,historyStates:[...history.slice(-47),clone(s)],ply:actions.length+1
      }),{...opts,replyMargin:2});
    }else throw Error('unknown policy');
    chosen=choice.action;
    assert(chosen&&legal(s,chosen));
    const reason=choice.reason??'unknown';
    changes[reason]=(changes[reason]??0)+1;
    if(reason.includes('defense')||reason.includes('prevent')||reason==='immediate-own-win')safetyChecks.blocked++;
    if(JSON.stringify(chosen)!==JSON.stringify(raw.pv[0]))safetyChecks.changed++;
    if(!first)first={ply:actions.length,base:raw.pv[0],chosen,reason,rootQ:raw.diagnostics?.rootChildren?.[0]?.qFromRoot??null};
    latencies.push(performance.now()-begin);
   }
   history.push(clone(s));actions.push(chosen);s=apply(s,chosen);
  }
  const item={...t,candidateWon:s.winner===t.seat,winner:s.winner,cutoff:s.winner===null,
   totalPlies:actions.length,continuationPlies:actions.length-f.actions.length,candidateSamples,
   first,changes,safetyChecks,latencies,actionsSha:sha(actions),actions};
  result.games.push(item);writeFileSync(out,JSON.stringify(result)+'\n');
  console.log('V3 PAIRED',i+1,'/',tasks.length,t.fixture,t.opponent,'seat',t.seat,t.variant,
   'win',item.candidateWon,'plies',item.continuationPlies,'changes',item.safetyChecks.changed,
   'gate',item.safetyChecks.blocked,'cutoff',item.cutoff);
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()));}
result.summary={games:result.games.length,byVariant:Object.fromEntries(variants.map(v=>{
 const g=result.games.filter(x=>x.variant===v);return[v,{games:g.length,wins:g.filter(x=>x.candidateWon).length,
 cutoffs:g.filter(x=>x.cutoff).length}] }))};
writeFileSync(out,JSON.stringify(result)+'\n');
console.log('V3 PAIRED SUMMARY',JSON.stringify(result.summary));
