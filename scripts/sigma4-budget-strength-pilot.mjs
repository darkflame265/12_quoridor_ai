import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
const d=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json'));
const fixtures=d.fixtures.slice(0,2);
const tasks=fixtures.flatMap(f=>[0,1].map(side=>({fixture:f.id,candidateSide:side})));
const out='evaluation/sigma4-budget-100-vs-200-20261105.json';
const sha=s=>createHash('sha256').update(JSON.stringify(s)).digest('hex');
const settings={candidateSimulations:100,referenceSimulations:200,fixtures:fixtures.map(f=>f.id),maxPlies:200,seed:20261105,policy:d.settings.rootChoice};
let report={version:'sigma4-budget-100-vs-200-pilot-v1',settings,planned:tasks.length,games:[]};
if(existsSync(out)){const old=JSON.parse(readFileSync(out));if(JSON.stringify(old.settings)!==JSON.stringify(settings))throw Error('resume mismatch');report.games=old.games;}
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
const candidate=new SigmaProcess({variant:'sigma3',simulations:100});
const reference=new SigmaProcess({variant:'sigma3',simulations:200});
try{
 for(let i=report.games.length;i<tasks.length;i++){
  const task=tasks[i],fixture=fixtures.find(f=>f.id===task.fixture);
  let state=initial(),history=[],actions=[],elapsed={candidate:0,reference:0},moves={candidate:0,reference:0};
  for(const a of fixture.actions){history.push(clone(state));state=apply(state,a);actions.push(a);}
  const rand0=rng(810003+i),rand1=rng(110011+i);
  while(state.winner===null&&actions.length<settings.maxPlies){
   const isCandidate=state.turn===task.candidateSide;
   const worker=isCandidate?candidate:reference;
   const raw=await worker.search({...state,historyStates:history.slice(-48)});
   const choice=chooseWeightedResearchCandidate(state,raw,isCandidate?rand0:rand1,settings.policy);
   if(!legal(state,choice.action))throw Error('illegal');
   elapsed[isCandidate?'candidate':'reference']+=raw.elapsedMs||0;
   moves[isCandidate?'candidate':'reference']++;
   history.push(clone(state));actions.push(choice.action);state=apply(state,choice.action);
  }
  const game={...task,candidateWon:state.winner===task.candidateSide,cutoff:state.winner===null,plies:actions.length,elapsed,moves,hash:sha(actions),actions};
  report.games.push(game);
  writeFileSync(out,JSON.stringify(report)+'\n');
  console.log('GAME',i+1,'/',tasks.length,'seat',task.candidateSide,game.candidateWon?'100 WIN':'200 WIN',game.plies,game.cutoff?'CUTOFF':'');
 }
}finally{await Promise.all([candidate.close(),reference.close()]);}
console.log('SUMMARY',report.games.map(g=>({fixture:g.fixture,side:g.candidateSide,won:g.candidateWon,plies:g.plies})));
