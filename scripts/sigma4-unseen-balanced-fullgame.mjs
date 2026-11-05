import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const ids=[17,23,28,29,32,33,40,45].map(n=>'independent-wall-'+String(n).padStart(3,'0'));
const starts=ids.map((id,i)=>{
 const p=bank.find(x=>x.id===id);assert(p,'unknown position '+id);
 return {id:p.id,positionId:p.positionId,seed:p.seed,split:p.split,ply:p.ply,wallCount:p.wallCount,side:i%2};
});
assert.equal(starts.filter(x=>x.split==='holdout').length,4);
assert(starts.every(x=>{const p=bank.find(b=>b.id===x.id);return Math.abs(p.ownDistance-p.enemyDistance)<=1;}));
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8')).settings.rootChoice;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const sourcePaths=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','scripts/sigma4-safe-original-v3.mjs'];
const sourceHashes=Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const config={version:'sigma4-new-midgame-balanced-fullgame-v1',
 starts,opponents:['sigma2','sigma3'],candidatePolicy:'sigma4-v3-weighted',
 candidateSimulations:200,opponentSimulations:200,maxTotalPlies:200,
 treeReuse:false,exploration:0,seedBase:20261106,rootChoice,sourceHashes,
 caveat:'Only eight independent generated midgame starts, not a broad estimate of engine strength'};
const out='evaluation/sigma4-unseen-wall-balanced-fullgame-20261105.json';
let result={config,games:[]};
if(existsSync(out)){
 const old=JSON.parse(readFileSync(out,'utf8'));
 assert.deepEqual(old.config,config,'resume hash mismatch');
 result=old;
}
const random=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
const tasks=starts.flatMap((p,i)=>config.opponents.map((op,j)=>({...p,op,seed:config.seedBase+i*12347+j*7001})));
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const worker={
 candidate:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})
};
try{
 await Promise.all(Object.values(worker).map(w=>w.health()));
 for(let i=result.games.length;i<tasks.length;i++){
  const task=tasks[i],p=bank.find(x=>x.id===task.id);
  let s=initial(),history=[],actions=[];
  for(const action of p.actions){
   assert(legal(s,action));
   history.push(clone(s));actions.push(action);s=apply(s,action);
  }
  assert.equal(hash(s),hash(p.state));
  const rng=random(task.seed),decisionSamples=[],rootStats={hits:0,misses:0};
  while(s.winner===null&&actions.length<config.maxTotalPlies){
   const isCandidate=s.turn===task.side;
   const raw=await (isCandidate?worker.candidate:worker[task.op]).search({...s,historyStates:history.slice(-48)});
   const choice=isCandidate?chooseWeightedTacticalV3(s,raw,rng,rootChoice):{action:raw.pv[0],reason:'native-opponent'};
   assert(choice.action&&legal(s,choice.action),'illegal action '+task.id+' '+actions.length);
   if(isCandidate&&decisionSamples.length<5){
    decisionSamples.push({ply:actions.length,value:raw.value,reason:choice.reason,chosen:choice.action,
     rootQ:raw.diagnostics.rootChildren[0]?.qFromRoot??null});
   }
   if(isCandidate&&raw.inferenceCache){
    rootStats.hits+=raw.inferenceCache.hits;rootStats.misses+=raw.inferenceCache.misses;
   }
   history.push(clone(s));actions.push(choice.action);s=apply(s,choice.action);
  }
  const game={startId:task.id,split:task.split,positionId:task.positionId,
   candidateSide:task.side,opponent:task.op,seed:task.seed,
   winner:s.winner,cutoff:s.winner===null,candidateWon:s.winner===task.side,
   totalPlies:actions.length,continuationPlies:actions.length-p.ply,
   rootStats,decisionSamples,fullMovesHash:hash(actions),actions};
  result.games.push(game);
  writeFileSync(out,JSON.stringify(result)+'\n');
  console.log('FULL GAME',i+1,'/',tasks.length,task.split,task.id,'vs',task.op,
   'candidateSide',task.side,'win',game.candidateWon,'plies',game.continuationPlies,'cutoff',game.cutoff);
 }
}finally{await Promise.all(Object.values(worker).map(w=>w.close()));}
result.summary={games:result.games.length,holdout:result.games.filter(g=>g.split==='holdout').length,
 development:result.games.filter(g=>g.split==='development').length,
 wins:result.games.filter(g=>g.candidateWon).length,
 cutoffs:result.games.filter(g=>g.cutoff).length,
 byOpponent:Object.fromEntries(config.opponents.map(op=>[op,{games:result.games.filter(g=>g.opponent===op).length,wins:result.games.filter(g=>g.opponent===op&&g.candidateWon).length}]))};
writeFileSync(out,JSON.stringify(result)+'\n');
console.log('FULL GAME SUMMARY',JSON.stringify(result.summary));
