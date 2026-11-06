import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const load=p=>JSON.parse(readFileSync('evaluation/'+p,'utf8'));
const lines=p=>readFileSync('evaluation/'+p,'utf8').trim().split('\n').map(JSON.parse);
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const report=load('sigma4-crosspolicy-independent-20261106.json');
const bank=Object.fromEntries(lines('sigma4-unseen-wall-positions-20261105.jsonl').map(x=>[x.id,x]));
const deep=Object.fromEntries(load('sigma4-unseen-wall-deep-20261105.json').rows.map(x=>[x.id,x]));
const previousOld=load('sigma4-unseen-wall-fullgame-20261105.json').games;
const previousBalanced=load('sigma4-unseen-wall-balanced-fullgame-20261105.json').games;
const previousCounter=load('sigma4-028-040-counterfactual-20261105.json').games;
const earlierUsed=new Set([...previousOld,...previousBalanced].map(x=>x.startId).concat(previousCounter.map(x=>x.id)));
const groups=new Map();
assert.equal(report.config.positions.length,16);
assert.equal(report.config.policyMatrix.length,4);
assert.equal(report.games.length,64,'cannot audit unfinished tournament');
const keys=new Set(),all=[];
for(const game of report.games){
 const p=bank[game.id];
 assert(p&&game.positionId===p.positionId);
 assert(!earlierUsed.has(game.id),'reuse old evaluation start: '+game.id);
 assert(game.split===p.split);
 assert(!game.cutoff);
 assert([0,1].includes(game.observedWinner));
 assert(game.originalPlayerWon===(game.observedWinner===p.state.turn));
 assert(game.actions.length===game.plies);
 assert(game.actions.length<=200);
 assert.deepEqual(game.actions.slice(0,p.ply),p.actions);
 assert(sha(game.actions)===game.actionsHash);
 const key=game.id+'/'+game.policy;
 assert(!keys.has(key),'duplicate policy rollout '+key);
 keys.add(key);
 assert(report.config.policyMatrix.some(x=>x.name===game.policy&&x.self===game.selfPolicy&&x.opponent===game.opponent));
 let state=initial();
 for(const [i,a] of game.actions.entries()){
  assert(legal(state,a),'illegal move '+key+' ply '+i);
  state=apply(state,a);
 }
 assert.equal(state.winner,game.observedWinner);
 if(!groups.has(game.id))groups.set(game.id,[]);
 groups.get(game.id).push(game);
}
assert.equal(groups.size,16);
const platt=load('sigma4-value-calibrator-prototype-20261105.json');
const applyPlatt=p=>{
 const q=Math.max(1e-6,Math.min(1-1e-6,p));
 const z=platt.logitScale*Math.log(q/(1-q))+platt.logitBias;
 return 1/(1+Math.exp(-z));
};
for(const [id,games] of groups){
 assert.equal(games.length,4,'missing policy '+id);
 const p=bank[id],r=deep[id];
 assert(r&&r.positionId===p.positionId);
 const label=games.filter(g=>g.originalPlayerWon).length/4;
 const predicted=(r.modelValue+1)/2;
 const q400=(r.search400.rootQ+1)/2;
 const predictedPlatt=applyPlatt(predicted);
 const score=(q)=>games.reduce((sum,g)=>sum+(q-Number(g.originalPlayerWon))**2,0)/games.length;
 all.push({id,positionId:p.positionId,split:p.split,seed:p.seed,wallCount:p.wallCount,
  ply:p.ply,pathGap:p.ownDistance-p.enemyDistance,observedWinFraction:label,
  observedWins:games.filter(g=>g.originalPlayerWon).length,policyUnanimity:label===0||label===1,
  observedOutcomes:games.map(g=>({policy:g.policy,opponent:g.opponent,candidatePolicy:g.selfPolicy,
   winner:g.observedWinner,originalPlayerWon:g.originalPlayerWon,totalPlies:g.plies})),
  originalNetworkValue:r.modelValue,originalNetworkProbability:predicted,
  search400RootQ:r.search400.rootQ,search400Probability:q400,
  priorPlattProbability:predictedPlatt,
  brierNetwork:score(predicted),brier400:score(q400),brierPlatt:score(predictedPlatt),
  state:p.state,fullPrefix:p.actions,
  labelQuality:'Policy-conditioned win fraction from 4 correlated continuations; not a minimax label'});
}
function mean(arr,k){return arr.reduce((s,r)=>s+r[k],0)/arr.length;}
function summary(rows){
 if(!rows.length)return null;
 return {uniquePositions:rows.length,policyGames:rows.length*4,
  unanimous:rows.filter(x=>x.policyUnanimity).length,conflicted:rows.filter(x=>!x.policyUnanimity).length,
  meanObservedWinFraction:mean(rows,'observedWinFraction'),
  meanNNProbability:mean(rows,'originalNetworkProbability'),
  brierOriginal:mean(rows,'brierNetwork'),
  brierSearch400:mean(rows,'brier400'),
  brierOldPlatt:mean(rows,'brierPlatt')};
}
const development=all.filter(x=>x.split==='development');
const holdout=all.filter(x=>x.split==='holdout');
assert.equal(development.length,12);assert.equal(holdout.length,4);
const candidate=development.filter(x=>x.policyUnanimity);
const rejected=development.filter(x=>!x.policyUnanimity);
const evaluation={version:'sigma4-diverse-policy-value-audit-v1',
 sources:{gameSource:'evaluation/sigma4-crosspolicy-independent-20261106.json',gameSourceHash:sha(report.config),
  networkSource:'vendor/sigma-quoridor/models/best.onnx'},
 totals:summary(all),development:summary(development),holdout:summary(holdout),
 policyResults:Object.fromEntries(report.config.policyMatrix.map(policy=>{
  const subset=report.games.filter(g=>g.policy===policy.name);
  return [policy.name,{games:subset.length,wins:subset.filter(g=>g.originalPlayerWon).length}];
 })),
 positionSummaries:all.map(({state,fullPrefix,...r})=>r),
 candidateCount:candidate.length,rejectedAmbiguousCount:rejected.length,
 diagnosticNote:'Each of 16 independent boards has four policy continuations; group by board, never assume 64 independent training labels.',
 gates:{all64GamesReplayed:true,oldBankStartOverlap:false,unseenHoldoutProtected:true,
  unbiasedOptimalValueTargets:false,readyForFullNetworkTraining:false,
  productionPromotionApproved:false}};
writeFileSync('evaluation/sigma4-crosspolicy-audit-20261106.json',JSON.stringify(evaluation,null,2)+'\n');
writeFileSync('evaluation/sigma4-crosspolicy-development-unanimous-20261106.jsonl',
 candidate.map(x=>JSON.stringify(x)).join('\n')+(candidate.length?'\n':''));
writeFileSync('evaluation/sigma4-crosspolicy-development-ambiguous-20261106.jsonl',
 rejected.map(x=>JSON.stringify(x)).join('\n')+(rejected.length?'\n':''));
console.log('PASS CROSS-POLICY AUDIT',JSON.stringify({totals:evaluation.totals,development:evaluation.development,
 holdout:evaluation.holdout,candidates:evaluation.candidateCount,ambiguous:evaluation.rejectedAmbiguousCount,
 promotion:evaluation.gates.productionPromotionApproved}));
