import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal,clone,moves,validWall} from '../src/engine.js';
import {SigmaProcess} from './sigma4-isolated-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-weighted-tactical-v3.mjs';
const sources=['evaluation/sigma4-opening-diversity-games.json','evaluation/sigma4-natural-exploratory-games.json','evaluation/sigma4-vs-sigma3-expanded.json'];
const fixtures=[],seen=new Set();
for(const file of sources){
 const d=JSON.parse(readFileSync(file,'utf8'));
 for(let i=0;i<d.games.length;i++){
  const six=d.games[i].firstSixActions,k=JSON.stringify(six);
  if(!six||six.length!==6||seen.has(k))continue;
  let s=initial();
  for(const action of six){if(!legal(s,action))throw Error('illegal fixture: '+file+':'+i);s=apply(s,action);}
  if(s.turn!==0||s.winner!==null)throw Error('bad fixture');
  fixtures.push({id:'opening-'+(fixtures.length+1),file,sourceGame:i,actions:six});
  seen.add(k);
 }
}
if(fixtures.length<6)throw Error('need 6 distinct openings, got '+fixtures.length);
fixtures.splice(0,fixtures.length,...fixtures.filter(f=>['opening-2','opening-5'].includes(f.id)));
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const OUT='evaluation/sigma4-weighted-v3-tactical-smoke-20261105.json';
const opponents=['sigma2','sigma3'];
const settings={sims:200,deterministic:true,reuse:false,rootChoice:{rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06},maxPlies:200,scope:'selected-training-fixtures-smoke-only'};
const tasks=opponents.flatMap(opponent=>fixtures.flatMap(fixture=>[0,1].map(candidateSide=>({opponent,fixture:fixture.id,candidateSide}))));
const provenance={sigma2Worker:hash(readFileSync('scripts/sigma2-baseline-worker.py','utf8')),sigma3Worker:hash(readFileSync('scripts/sigma-inference-worker.py','utf8')),policy:hash(readFileSync('scripts/sigma4-weighted-tactical-v3.mjs','utf8'))};
let report={version:'sigma4-weighted-v3-tactical-vs-sigma23-selected-fixtures-smoke-v1',
 date:'2026-11-05',settings,fixtures,provenance,planned:tasks.length,games:[]};
if(existsSync(OUT)){const previous=JSON.parse(readFileSync(OUT,'utf8'));if(JSON.stringify(previous.settings)!==JSON.stringify(settings)||JSON.stringify(previous.provenance)!==JSON.stringify(provenance)||JSON.stringify(previous.fixtures)!==JSON.stringify(fixtures))throw Error('dataset mismatch');report=previous;}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261105'});
const agents={sigma2:new SigmaProcess({variant:'sigma2'}),sigma3:new SigmaProcess({variant:'sigma3'}),candidate:new SigmaProcess({variant:'sigma3'})};
const nextRand=(seed)=>{let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return (s>>>0)/4294967296;}};
try{
 for(let i=report.games.length;i<tasks.length;i++){
  const task=tasks[i],fixture=fixtures.find(f=>f.id===task.fixture),seed=20261105+fixtures.indexOf(fixture)*8191+opponents.indexOf(task.opponent)*100003;
  const random=nextRand(seed);
  let state=initial(),history=[],actions=[],trace=[],changed=0,times={candidate:0,opponent:0};
  for(const action of fixture.actions){history.push(clone(state));actions.push(action);state=apply(state,action);}
  for(let ply=6;ply<settings.maxPlies&&state.winner===null;ply++){
   const engine=state.turn===task.candidateSide?'candidate':task.opponent;
   const base=await agents[engine].search({...state,historyStates:history.slice(-48)});
   const before=base.pv?.[0];if(!before||!legal(state,before))throw Error('illegal native '+engine+' move');
   const weighted=engine==='candidate'?chooseWeightedTacticalV3(state,base,random,settings.rootChoice):null;
   const action=weighted?.action??before;
   if(!legal(state,action))throw Error('illegal chosen '+engine+' move');
   const overridden=weighted?.changed===true;
   if(overridden)changed++;
   trace.push({ply,side:state.turn,engine,action,changed:overridden,reason:weighted?.reason??'native',
    baseAction:before,rootChildren:engine==='candidate'?base.diagnostics?.rootChildren?.slice(0,6):undefined});
   times[engine==='candidate'?'candidate':'opponent']+=base.elapsedMs??0;
   history.push(clone(state));actions.push(action);state=apply(state,action);
  }
  const row={...task,index:i,seed,plies:actions.length,winner:state.winner,cutoff:state.winner===null,
   candidateWon:state.winner===task.candidateSide,changed,
   totalElapsedMs:times,uniqueHash:hash(actions),firstSixHash:hash(actions.slice(0,6)),trace};
  report.games.push(row);
  writeFileSync(OUT,JSON.stringify(report)+'\n');
  const subset=report.games.filter(g=>g.opponent===task.opponent);
  console.log('GAME',i+1,'/',tasks.length,task.opponent,task.fixture,'candidateSide',task.candidateSide,
   'winner',state.winner===null?'cutoff':row.candidateWon?'SIGMA4-v3':task.opponent,
   'score',subset.filter(g=>g.candidateWon).length+'-'+subset.filter(g=>!g.candidateWon&&!g.cutoff).length,
   'overrides',changed,'unique',new Set(subset.map(g=>g.uniqueHash)).size);
 }
}finally{await Promise.all(Object.values(agents).map(a=>a.close()));}
console.log('FINAL',JSON.stringify(opponents.map(opponent=>{const g=report.games.filter(x=>x.opponent===opponent);return {opponent,games:g.length,wins:g.filter(x=>x.candidateWon).length,losses:g.filter(x=>!x.candidateWon&&!x.cutoff).length,cutoffs:g.filter(x=>x.cutoff).length,unique:new Set(g.map(x=>x.uniqueHash)).size}})));
