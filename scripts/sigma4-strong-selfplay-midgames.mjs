import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,distance} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const path='evaluation/sigma4-strong-selfplay-midgames-20261106.json';
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8')).settings.rootChoice;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sources=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py','scripts/sigma4-safe-original-v3.mjs','scripts/sigma4-budget-process.mjs','vendor/sigma-quoridor/models/best.onnx'];
const settings={version:'sigma4-strong-selfplay-midgame-v1',games:16,
 targets:[20,24,28,32],seed:20261106,simulations:200,
 source:'Two real MCTS policies (weighted Sigma4 vs native Sigma3) play from the actual initial state; no synthetic random walls',
 rootChoice,sourceHashes:Object.fromEntries(sources.map(x=>[x,createHash('sha256').update(readFileSync(x)).digest('hex')]))};
let result={settings,openings:[],attempts:[]};
if(existsSync(path)){const x=JSON.parse(readFileSync(path,'utf8'));assert.deepEqual(x.settings,settings);result=x;}
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
const key=s=>sha({p:s.p,walls:s.walls.map(w=>({x:w.x,y:w.y,o:w.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
const historical=new Set();
for(const file of ['evaluation/sigma4-value-development-positions-20261105.jsonl','evaluation/sigma4-value-holdout-positions-20261105.jsonl','evaluation/sigma4-unseen-wall-positions-20261105.jsonl']){
 for(const ln of readFileSync(file,'utf8').trim().split('\n')){const v=JSON.parse(ln);historical.add(key(v.state));}
}
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const weighted=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
const native=new SigmaProcess({variant:'sigma3',simulations:200});
try{
 await weighted.health();await native.health();
 for(let attempt=result.attempts.length;attempt<settings.games;attempt++){
  const target=settings.targets[attempt%settings.targets.length];
  let state=initial(),history=[],actions=[],searches=[],sourceSides=attempt%2;
  const random=rng(settings.seed+attempt*7927);
  let candidateMoves=0;
  while(state.winner===null&&actions.length<target){
   const self=state.turn===sourceSides;
   const search=await (self?weighted:native).search({...state,ply:actions.length,historyStates:history.slice(-48)});
   const move=self?chooseWeightedTacticalV3(state,search,random,rootChoice).action:search.pv[0];
   assert(move&&legal(state,move));
   if(self)candidateMoves++;
   history.push(clone(state));actions.push(move);state=apply(state,move);
  }
  const passed=state.winner===null&&actions.length===target&&
    !historical.has(key(state))&&!result.openings.some(o=>o.positionId===key(state));
  const info={attempt,target,sourceSides,seed:settings.seed+attempt*7927,plies:actions.length,
    wallCount:state.walls.length,ownDistance:distance(state,state.turn),enemyDistance:distance(state,1-state.turn),
    result:state.winner,accepted:passed};
  result.attempts.push(info);
  if(passed){
   const accepted=result.openings.length;
   result.openings.push({id:'strong-play-'+String(attempt+1).padStart(2,'0'),attempt,seed:info.seed,
    sourceSides,target,split:accepted%4===0?'holdout':'development',
    positionId:key(state),ply:actions.length,wallCount:state.walls.length,
    ownDistance:info.ownDistance,enemyDistance:info.enemyDistance,
    candidateMoves,actions,board:clone(state)});
  }
  writeFileSync(path,JSON.stringify(result)+'\n');
  console.log('STRONG SELFPLAY',attempt+1,'/',settings.games,'target',target,'walls',info.wallCount,
    'gap',info.ownDistance-info.enemyDistance,'accepted',passed,'total',result.openings.length);
 }
}finally{await Promise.all([weighted.close(),native.close()]);}
result.summary={attempts:result.attempts.length,accepted:result.openings.length,
 holdout:result.openings.filter(x=>x.split==='holdout').length,
 development:result.openings.filter(x=>x.split==='development').length,
 maxWalls:Math.max(...result.openings.map(x=>x.wallCount)),
 warning:'Trajectory groups are independent random seeds but share the same trained model/policies; not independent minimax evidence'};
writeFileSync(path,JSON.stringify(result)+'\n');
console.log('STRONG MIDGAME SUMMARY',JSON.stringify(result.summary));
