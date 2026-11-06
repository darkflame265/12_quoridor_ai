import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const p='evaluation/sigma4-diverse-strong-midgame-bank-20261106.json';
const src=JSON.parse(readFileSync(p,'utf8'));
assert.equal(src.attempts.length,src.settings.attempts,'Finish source collection before outcomes');
assert(src.positions.length>=16,'Need >=16 balanced independent midgames');
const starts=src.positions.slice(0,16);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sources=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py',
 'scripts/sigma2-baseline-worker.py','scripts/sigma4-safe-original-v3.mjs','scripts/sigma4-budget-process.mjs',
 'vendor/sigma-quoridor/models/best.onnx'];
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8')).settings.rootChoice;
const policies=[
 {name:'weighted-vs-sigma2',self:'weighted',opponent:'sigma2'},
 {name:'native-vs-sigma2',self:'native',opponent:'sigma2'},
 {name:'weighted-vs-sigma3',self:'weighted',opponent:'sigma3'},
 {name:'native-vs-sigma3',self:'native',opponent:'sigma3'}
];
const config={version:'sigma4-diverse-strong-outcomes-v1',
 bankSha256:createHash('sha256').update(readFileSync(p)).digest('hex'),
 positions:starts.map(x=>({id:x.id,split:x.split,positionId:x.positionId,sourceStyle:x.sourceStyle,seed:x.seed,ply:x.ply,wallCount:x.wallCount,pathGap:x.pathGap})),
 policyMatrix:policies,simulations:200,maxTotalPlies:200,seedBase:20261106,
 rootChoice,sourceHashes:Object.fromEntries(sources.map(x=>[x,createHash('sha256').update(readFileSync(x)).digest('hex')])),
 notes:['Each starting board is played with 4 policy variants, but four games are correlated and cannot be counted as 4 independent labeled positions',
  'Observed winners are not minimax / solved game values',
  'Native Sigma2 worker has preexisting user-local uncommitted changes']};
const jobs=starts.flatMap(s=>policies.map(policy=>({id:s.id,policy})));
const outputFile='evaluation/sigma4-diverse-strong-outcomes-20261106.json';
let report={config,games:[]};
if(existsSync(outputFile)){
 const old=JSON.parse(readFileSync(outputFile,'utf8'));assert.deepEqual(old.config,config,'Resume source mismatch');report=old;
}
const rng=seed=>{let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;}};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const workers={
 self:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})
};
try{
 await Promise.all(Object.values(workers).map(w=>w.health()));
 for(let i=report.games.length;i<jobs.length;i++){
  const job=jobs[i],p=starts.find(x=>x.id===job.id);
  let state=initial(),hist=[],actions=[];
  for(const a of p.actions){assert(legal(state,a));hist.push(clone(state));actions.push(a);state=apply(state,a);}
  assert.deepEqual(state,p.board);
  const seed=config.seedBase+p.seed*101+(job.policy.opponent==='sigma2'?11:29);
  const rand=rng(seed),candidateTimings=[];
  let firstAction=null;
  while(state.winner===null&&actions.length<config.maxTotalPlies){
   const candidate=state.turn===p.board.turn;
   const before=performance.now();
   const result=await (candidate?workers.self:workers[job.policy.opponent])
    .search({...state,ply:actions.length,historyStates:hist.slice(-48)});
   const elapsed=performance.now()-before;
   const chosen=candidate&&job.policy.self==='weighted'?
     chooseWeightedTacticalV3(state,result,rand,rootChoice).action:result.pv[0];
   assert(chosen&&legal(state,chosen),'illegal move '+p.id+' '+job.policy.name+' '+actions.length);
   if(candidate){
    candidateTimings.push(elapsed);
    if(!firstAction)firstAction={ply:actions.length,action:chosen,rootQ:result.diagnostics?.rootChildren?.[0]?.qFromRoot??null};
   }
   hist.push(clone(state));actions.push(chosen);state=apply(state,chosen);
  }
  const game={id:p.id,split:p.split,policy:job.policy.name,self:job.policy.self,opponent:job.policy.opponent,
   seed,candidateSide:p.board.turn,winner:state.winner,cutoff:state.winner===null,
   observedMoverWon:state.winner===p.board.turn,plies:actions.length,continuation:actions.length-p.ply,
   firstAction,candidateTimings,actionsHash:sha(actions),actions};
  report.games.push(game);
  writeFileSync(outputFile,JSON.stringify(report)+'\n');
  console.log('DIVERSE OUTCOME',i+1,'/',jobs.length,p.id,p.split,job.policy.name,
   'win',game.observedMoverWon,'draw',game.cutoff,'moves',game.continuation);
 }
}finally{await Promise.all(Object.values(workers).map(w=>w.close()));}
const per=starts.map(p=>{
 const games=report.games.filter(x=>x.id===p.id);
 return {id:p.id,split:p.split,winFraction:games.filter(x=>x.observedMoverWon).length/games.length,
  outcomeUnanimity:games.every(x=>x.observedMoverWon===games[0].observedMoverWon),
  draws:games.filter(x=>x.cutoff).length};
});
report.summary={games:report.games.length,distinctSources:per.length,unanimous:per.filter(x=>x.outcomeUnanimity).length,
 ambiguous:per.filter(x=>!x.outcomeUnanimity).length,
 cutoffGames:report.games.filter(x=>x.cutoff).length,byPosition:per};
writeFileSync(outputFile,JSON.stringify(report)+'\n');
console.log('DIVERSE OUTCOME SUMMARY',JSON.stringify(report.summary));
