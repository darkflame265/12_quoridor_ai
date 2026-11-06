import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const ids=[3,4,7,8,18,19,20,26,34,35,36,48,21,25,37,41].map(x=>'independent-wall-'+String(x).padStart(3,'0'));
const positions=ids.map(id=>{const p=bank.find(x=>x.id===id);assert(p);return p;});
assert.equal(new Set(positions.map(p=>p.seed)).size,16);
assert.equal(positions.filter(p=>p.split==='development').length,12);
assert.equal(positions.filter(p=>p.split==='holdout').length,4);
const policyMatrix=[
 {name:'weighted-vs-sigma2',self:'weighted',opponent:'sigma2'},
 {name:'native-vs-sigma2',self:'native',opponent:'sigma2'},
 {name:'weighted-vs-sigma3',self:'weighted',opponent:'sigma3'},
 {name:'native-vs-sigma3',self:'native',opponent:'sigma3'}
];
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8')).settings.rootChoice;
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const codePaths=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','scripts/sigma4-safe-original-v3.mjs','vendor/sigma-quoridor/models/best.onnx'];
const config={version:'sigma4-crosspolicy-diverse-independent-v1',seed:20261106,
 positions:positions.map(p=>({id:p.id,positionId:p.positionId,split:p.split,seed:p.seed,ply:p.ply,wallCount:p.wallCount})),
 policyMatrix,rootChoice,maxTotalPlies:200,simulations:200,
 sourceHashes:Object.fromEntries(codePaths.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')])),
 warning:'Policy-conditioned observed outcomes, not minimax labels; native Sigma2 local worker contains user edits'};
const tasks=positions.flatMap(p=>policyMatrix.map(policy=>({id:p.id,policy})));
const out='evaluation/sigma4-crosspolicy-independent-20261106.json';
let report={config,games:[]};
if(existsSync(out)){const old=JSON.parse(readFileSync(out,'utf8'));assert.deepEqual(old.config,config,'cannot resume after source/config change');report=old;}
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const agents={
 self:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})
};
try{
 await Promise.all(Object.values(agents).map(w=>w.health()));
 for(let i=report.games.length;i<tasks.length;i++){
  const task=tasks[i],p=positions.find(x=>x.id===task.id);
  let state=initial(),hist=[],actions=[];
  for(const a of p.actions){assert(legal(state,a));hist.push(clone(state));actions.push(a);state=apply(state,a);}
  assert.deepEqual(state,p.state);
  const random=rng(config.seed+p.seed*3+task.policy.name.length*977);
  let n0=0,n1=0,sample=null;
  while(state.winner===null&&actions.length<config.maxTotalPlies){
   const self=state.turn===p.state.turn;
   const resp=await (self?agents.self:agents[task.policy.opponent]).search({...state,historyStates:hist.slice(-48)});
   const choice=self&&task.policy.self==='weighted'?
    chooseWeightedTacticalV3(state,resp,random,rootChoice).action:resp.pv[0];
   assert(choice&&legal(state,choice),'illegal continuation '+task.id+' ply '+actions.length);
   if(self){n0++;if(sample===null)sample={ply:actions.length,action:choice,networkValue:resp.value,rootQ:resp.diagnostics.rootChildren[0]?.qFromRoot};}
   else n1++;
   hist.push(clone(state));actions.push(choice);state=apply(state,choice);
  }
  const row={id:p.id,split:p.split,positionId:p.positionId,policy:task.policy.name,
   selfPolicy:task.policy.self,opponent:task.policy.opponent,observedWinner:state.winner,
   originalPlayerWon:state.winner===p.state.turn,cutoff:state.winner===null,
   plies:actions.length,continuationPlies:actions.length-p.ply,n0,n1,sample,
   actionsHash:sha(actions),actions};
  report.games.push(row);writeFileSync(out,JSON.stringify(report)+'\n');
  console.log('POLICY',i+1,'/',tasks.length,p.id,p.split,task.policy.name,'WIN',row.originalPlayerWon,'continuation',row.continuationPlies,'cutoff',row.cutoff);
 }
}finally{await Promise.all(Object.values(agents).map(a=>a.close()));}
const per=positions.map(p=>{
 const rows=report.games.filter(g=>g.id===p.id);
 return {id:p.id,split:p.split,wins:rows.filter(g=>g.originalPlayerWon).length,losses:rows.filter(g=>!g.originalPlayerWon&&!g.cutoff).length,
  cutoffs:rows.filter(g=>g.cutoff).length,unanimous:rows.length===4&&rows.every(g=>g.originalPlayerWon===rows[0].originalPlayerWon)};
});
report.summary={games:report.games.length,positions:positions.length,unanimousPositions:per.filter(r=>r.unanimous).length,
 conflictedPositions:per.filter(r=>!r.unanimous).length,byPosition:per};
writeFileSync(out,JSON.stringify(report)+'\n');
console.log('SUMMARY',JSON.stringify(report.summary));
