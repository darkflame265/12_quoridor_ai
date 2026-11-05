import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal,moves,distance,validWall} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';

const src=JSON.parse(readFileSync('evaluation/sigma4-bitset200-vs-sigma23-20261105.json','utf8'));
const targets=[
 {fixture:'independent-wall-nw-20261105',seat:0,ply:10},
 {fixture:'independent-wall-se-20261105',seat:1,ply:17}
];
const early=JSON.parse(readFileSync('evaluation/sigma4-sigma3-early-root-options-20261105.json','utf8'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
const scenarios=[];
for(const target of targets){
 const game=src.games.find(g=>g.opponent==='sigma3'&&!g.candidateWon&&g.fixture===target.fixture&&g.candidateSide===target.seat);
 assert(game,'missing recorded loss');
 let s=initial(),history=[];
 for(let p=0;p<target.ply;p++){const a=game.actions[p];assert(legal(s,a));history.push(clone(s));s=apply(s,a);}
 const recorded=game.actions[target.ply];
 assert(legal(s,recorded),'recorded branch action illegal');
 assert.equal(s.turn,target.seat);
 const startDistance=distance(s,s.turn),oppDistance=distance(s,1-s.turn);
 const alternatives=moves(s).filter(a=>legal(s,a)).map(a=>{
  const next=apply(s,a);
  return {action:a,ownDist:distance(next,s.turn),oppDist:distance(next,1-s.turn)};
 }).sort((a,b)=>a.ownDist-b.ownDist||b.oppDist-a.oppDist||a.action.y-b.action.y||a.action.x-b.action.x);
 const option=early.rows.find(r=>r.fixture===target.fixture&&r.ply===target.ply);
 assert(option,'missing independently evaluated early root');
 const rootAlternative=option.children.find(c=>c.visits>=20&&JSON.stringify(c.action)!==JSON.stringify(recorded));
 assert(rootAlternative,'no supported alternative');
 const alternative={action:rootAlternative.action,ownDist:distance(apply(s,rootAlternative.action),s.turn),oppDist:distance(apply(s,rootAlternative.action),1-s.turn)};
 assert(alternative,'no alternative pawn step');
 scenarios.push({...target,recorded,alternative:alternative.action,startDistance,oppDistance,
  state:s,history:history.slice(-48),prefix:game.actions.slice(0,target.ply),
  alternateOwnDist:alternative.ownDist,recordedOwnDist:distance(apply(s,recorded),s.turn),
  recordedOppDist:distance(apply(s,recorded),1-s.turn),alternateOppDist:alternative.oppDist});
}
const settings={version:'counterfactual-early-mcts-candidates-v1',simulations:200,
 variants:['recorded','mcts-alternative'],maxPlies:200,opponent:'sigma3-native',
 rootChoice:src.settings.policy,seeds:[117011],sourceHash:sha(readFileSync('scripts/sigma4-bitset-wall-worker.py')),scenarioMetadata:scenarios.map(({state,history,prefix,...s})=>({...s,positionHash:sha(state),prefixHash:sha(prefix)}))};
const out='evaluation/sigma4-sigma3-counterfactual-early-20261105.json';
const tasklist=scenarios.flatMap((s,i)=>settings.seeds.flatMap(seed=>settings.variants.map(variant=>({scenarioIndex:i,seed,variant}))));
let report={settings,tasks:tasklist.length,games:[]};
if(existsSync(out)){
 const older=JSON.parse(readFileSync(out,'utf8'));
 assert.deepEqual(older.settings,settings,'Cannot resume with changed settings');
 report=older;
}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261105'});
const c=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
const o=new SigmaProcess({variant:'sigma3',simulations:200});
try{
 await Promise.all([c.health(),o.health()]);
 for(let i=report.games.length;i<tasklist.length;i++){
  const task=tasklist[i],sc=scenarios[task.scenarioIndex];
  const first=task.variant==='recorded'?sc.recorded:sc.alternative;
  let s=apply(sc.state,first),history=[...sc.history,clone(sc.state)],actions=[...sc.prefix,first],candidateN=0,opponentN=0,elapsed=0;
  const random=rng(task.seed+task.scenarioIndex*1319),start=performance.now();
  while(s.winner===null&&actions.length<settings.maxPlies){
   const candidate=s.turn===sc.seat;
   const search=await (candidate?c:o).search({...s,historyStates:history.slice(-48)});
   let a=candidate?chooseWeightedResearchCandidate(s,search,random,settings.rootChoice).action:search.pv?.[0];
   assert(a&&legal(s,a),'illegal continuation at scenario '+task.scenarioIndex+' branch '+task.variant);
   history.push(clone(s));actions.push(a);s=apply(s,a);
   if(candidate)candidateN++;else opponentN++;
   elapsed+=search.elapsedMs||0;
  }
  const row={scenarioIndex:task.scenarioIndex,seed:task.seed,variant:task.variant,
   branchPly:sc.ply,branchAction:first,fixture:sc.fixture,candidateSide:sc.seat,
   candidateWon:s.winner===sc.seat,cutoff:s.winner===null,winner:s.winner,
   finishedPlies:actions.length,continuationPlies:actions.length-sc.ply-1,
   candidateMoves:candidateN,opponentMoves:opponentN,workerElapsedMs:elapsed,wallMs:performance.now()-start,
   actionsHash:sha(actions),actions};
  report.games.push(row);writeFileSync(out,JSON.stringify(report)+'\n');
  console.log('BRANCH',i+1,'/',tasklist.length,sc.fixture,'ply',sc.ply,task.variant,'WIN',row.candidateWon,'CUT',row.cutoff,'CONT',row.continuationPlies);
 }
}finally{await Promise.all([c.close(),o.close()]);}
report.comparisons=scenarios.map((sc,i)=>{
 const games=report.games.filter(g=>g.scenarioIndex===i);
 return {fixture:sc.fixture,ply:sc.ply,seat:sc.seat,recorded:sc.recorded,alternative:sc.alternative,
  baselineWin:games.find(g=>g.variant==='recorded')?.candidateWon,
  alternativeWin:games.find(g=>g.variant==='mcts-alternative')?.candidateWon,
  baselinePlies:games.find(g=>g.variant==='recorded')?.finishedPlies,
  alternativePlies:games.find(g=>g.variant==='mcts-alternative')?.finishedPlies};
});
writeFileSync(out,JSON.stringify(report)+'\n');
console.log('SUMMARY',JSON.stringify(report.comparisons));
