import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal,moves,distance,validWall} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const deep=JSON.parse(readFileSync('evaluation/sigma4-unseen-wall-deep-20261105.json'));
const review=JSON.parse(readFileSync('evaluation/sigma4-unseen-wall-800-review-20261105.json'));
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json')).settings.rootChoice;
const ids=['independent-wall-028','independent-wall-040'];
const compare=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
const scenarios=[];
for(const id of ids){
 const p=bank.find(x=>x.id===id),ref=deep.rows.find(x=>x.id===id),check800=review.results.find(x=>x.id===id);
 assert(p&&ref&&check800&&p.split==='development');
 assert(compare(ref.search200.action,ref.search400.action)&&compare(ref.search400.action,check800.best800));
 let state=initial();for(const a of p.actions){assert(legal(state,a));state=apply(state,a);}
 assert.deepEqual(state,p.state);
 const original=ref.search400.action;
 const allPawns=moves(state).filter(x=>legal(state,x)&&!compare(x,original));
 const pawn=allPawns.map(a=>({a,own:distance(apply(state,a),state.turn),opp:distance(apply(state,a),1-state.turn)}))
  .sort((a,b)=>a.own-b.own||b.opp-a.opp||a.a.x-b.a.x||a.a.y-b.a.y)[0]?.a;
 const wall=ref.search400.top3.find(x=>x.action.type==='wall'&&legal(state,x.action))?.action;
 assert(pawn&&wall);
 assert(!compare(pawn,original)&&!compare(wall,original)&&!compare(wall,pawn));
 scenarios.push({id:p.id,positionId:p.positionId,split:p.split,ply:p.ply,ownDist:p.ownDistance,enemyDist:p.enemyDistance,
  originalAction:original,pawnAlternative:pawn,wallAlternative:wall,sourceNetworkValue:ref.modelValue,
  rootQ200:ref.search200.rootQ,rootQ400:ref.search400.rootQ,rootQ800:check800.q800,
  boardHash:sha(p.state),historyHash:sha(p.actions),baselineSource:'400-sim root best, matches 200 and 800'});
}
const sourceFiles=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','scripts/sigma4-safe-original-v3.mjs','vendor/sigma-quoridor/models/best.onnx'];
const config={version:'sigma4-028-040-counterfactual-v1',scenarios,opponents:['sigma2','sigma3'],
 arms:['original','pawn','wall'],seeds:[118031,921117],simulations:200,maxTotalPlies:200,
 candidate:'SIGMA4 weighted V3 with no model change',treeReuse:false,
 rootChoice,sourceHashes:Object.fromEntries(sourceFiles.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),
 experimentalNote:'Preselected alternatives by legal pawn advancement or observed 400-sim root wall candidate; not a blinded policy improvement.'};
const tasks=scenarios.flatMap(sc=>config.opponents.flatMap(op=>config.seeds.flatMap(seed=>config.arms.map(arm=>({id:sc.id,op,seed,arm})))));
const out='evaluation/sigma4-028-040-counterfactual-20261105.json';
let result={config,games:[]};
if(existsSync(out)){
 const old=JSON.parse(readFileSync(out,'utf8'));assert.deepEqual(old.config,config);
 result=old;
}
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261105'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const agents={candidate:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})};
try{
 await Promise.all(Object.values(agents).map(w=>w.health()));
 for(let i=result.games.length;i<tasks.length;i++){
  const task=tasks[i],sc=scenarios.find(x=>x.id===task.id),p=bank.find(x=>x.id===task.id);
  let state=initial(),history=[],actions=[];
  for(const a of p.actions){assert(legal(state,a));history.push(clone(state));actions.push(a);state=apply(state,a);}
  assert.equal(sha(state),sc.boardHash);
  const first=task.arm==='original'?sc.originalAction:task.arm==='pawn'?sc.pawnAlternative:sc.wallAlternative;
  assert(legal(state,first));
  history.push(clone(state));actions.push(first);state=apply(state,first);
  const random=rng(task.seed+sc.ply*1097),trace=[],started=performance.now();
  while(state.winner===null&&actions.length<config.maxTotalPlies){
   const candidate=state.turn===p.state.turn;
   const response=await (candidate?agents.candidate:agents[task.op]).search({...state,historyStates:history.slice(-48)});
   const choice=candidate?chooseWeightedTacticalV3(state,response,random,rootChoice):{action:response.pv[0]};
   assert(choice.action&&legal(state,choice.action),'illegal continuation '+task.id+'/'+task.arm+' ply='+actions.length);
   if(trace.length<8)trace.push({ply:actions.length,player:state.turn,action:choice.action,
    rootQ:response.diagnostics?.rootChildren?.[0]?.qFromRoot??null,
    networkValue:response.value});
   history.push(clone(state));actions.push(choice.action);state=apply(state,choice.action);
  }
  const game={...task,forced:first,initialPlayer:p.state.turn,winner:state.winner,draw:state.winner===null,
   currentPlayerWon:state.winner===p.state.turn,totalPlies:actions.length,
   continuationPlies:actions.length-p.ply-1,wallMs:performance.now()-started,
   trace,actionsHash:sha(actions),actions};
  result.games.push(game);writeFileSync(out,JSON.stringify(result)+'\n');
  console.log('COUNTERFACTUAL',i+1,'/',tasks.length,task.id,task.op,task.seed,task.arm,
   'win',game.currentPlayerWon,'plies',game.continuationPlies,'draw',game.draw);
 }
}finally{await Promise.all(Object.values(agents).map(w=>w.close()));}
result.summary={games:result.games.length,complete:result.games.every(x=>!x.draw),
 arms:Object.fromEntries(config.arms.map(arm=>[arm,{games:result.games.filter(g=>g.arm===arm).length,
  wins:result.games.filter(g=>g.arm===arm&&g.currentPlayerWon).length}]))};
writeFileSync(out,JSON.stringify(result)+'\n');
console.log('COUNTERFACTUAL SUMMARY',JSON.stringify(result.summary));
