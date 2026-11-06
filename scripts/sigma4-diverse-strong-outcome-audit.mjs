import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';

const read=p=>JSON.parse(readFileSync('evaluation/'+p,'utf8'));
const bank=read('sigma4-diverse-strong-midgame-bank-20261106.json');
const set=read('sigma4-diverse-strong-outcomes-20261106.json');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
assert.equal(set.config.positions.length,16);
assert.equal(set.games.length,64,'incomplete 4-policy rollout');
const target=bank.positions.slice(0,16);
const byId=Object.fromEntries(target.map(x=>[x.id,x]));
const gameKey=new Set(),group=new Map();
for(const g of set.games){
 const p=byId[g.id];assert(p);
 assert(g.split===p.split);
 assert(!g.cutoff,'must finish to terminal winner');
 assert([0,1].includes(g.winner));
 assert.equal(g.candidateSide,p.board.turn);
 assert.equal(g.observedMoverWon,g.winner===g.candidateSide);
 assert.deepEqual(g.actions.slice(0,p.actions.length),p.actions);
 assert.equal(g.actions.length,g.plies);
 assert.equal(hash(g.actions),g.actionsHash);
 const key=g.id+'/'+g.policy;
 assert(!gameKey.has(key));gameKey.add(key);
 assert(set.config.policyMatrix.some(x=>x.name===g.policy&&x.self===g.self&&x.opponent===g.opponent));
 let state=initial();
 for(const [i,a] of g.actions.entries()){
  assert(legal(state,a),'illegal '+key+' ply '+i);
  state=apply(state,a);
 }
 assert.equal(state.winner,g.winner);
 if(!group.has(g.id))group.set(g.id,[]);
 group.get(g.id).push(g);
}
assert.equal(group.size,16);
const candidates=[],ambiguous=[],summary=[];
for(const p of target){
 const games=group.get(p.id);
 assert.equal(games.length,4);
 const wins=games.filter(g=>g.observedMoverWon).length;
 const candidate={
  id:p.id,positionId:p.positionId,seed:p.seed,sourceStyle:p.sourceStyle,
  split:p.split,ply:p.ply,wallCount:p.wallCount,pathGap:p.pathGap,
  wins,losses:4-wins,observedWinFraction:wins/4,
  policyUnanimous:wins===0||wins===4,
  policyResults:games.map(g=>({policy:g.policy,winningMover:g.observedMoverWon,
   winner:g.winner,continuation:g.continuation})),
  state:p.board,history:p.actions,
  labelQuality:'Four correlated policy-conditioned outcomes; NOT a forced/solved win probability'
 };
 summary.push(Object.fromEntries(Object.entries(candidate).filter(([k])=>!['state','history'].includes(k))));
 if(p.split==='development'){
  if(candidate.policyUnanimous)candidates.push(candidate);
  else ambiguous.push(candidate);
 }
}
const count=split=>summary.filter(x=>x.split===split);
const report={version:'sigma4-diverse-midgame-outcome-audit-v1',
 sourceAttempts:bank.attempts.length,sourceBalancedPositions:bank.positions.length,
 analyzedIndependentSources:target.length,policyGames:set.games.length,
 developmentGroups:count('development').length,holdoutGroups:count('holdout').length,
 unanimouslyObserved:summary.filter(x=>x.policyUnanimous).length,
 ambiguousObserved:summary.filter(x=>!x.policyUnanimous).length,
 developmentTrainingReviewCandidates:candidates.length,
 developmentAmbiguousExcluded:ambiguous.length,
 holdoutTrainingExcluded:count('holdout').length,
 byStyle:Object.fromEntries(bank.settings.sourcePolicies.map(style=>[style,summary.filter(x=>x.sourceStyle===style).length])),
 byPosition:summary,
 gates:{entire64GamesLegallyReplayed:true,sourceGroupSplitPreserved:true,
  holdoutUsedForModelFit:false,policyOutcomeIsMinimaxTruth:false,
  trainingApproved:false,productionApproved:false},
 limitations:['Four games at the same board are correlated; effective sample size is 16 source boards',
  'Policy agreements do not establish game theoretic truth',
  'All source policies use the same original neural network; selection bias persists',
  'Recorded local SIGMA2 worker contains unrelated user modifications']};
writeFileSync('evaluation/sigma4-diverse-strong-outcome-audit-20261106.json',JSON.stringify(report,null,2)+'\n');
writeFileSync('evaluation/sigma4-diverse-development-candidates-20261106.jsonl',
 candidates.map(x=>JSON.stringify(x)).join('\n')+(candidates.length?'\n':''));
writeFileSync('evaluation/sigma4-diverse-development-ambiguous-20261106.jsonl',
 ambiguous.map(x=>JSON.stringify(x)).join('\n')+(ambiguous.length?'\n':''));
console.log('PASS DIVERSE OUTCOME AUDIT',JSON.stringify({source:report.sourceBalancedPositions,
 games:report.policyGames,developmentGroups:report.developmentGroups,holdoutGroups:report.holdoutGroups,
 unanimous:report.unanimouslyObserved,ambiguous:report.ambiguousObserved,
 developmentTrainingReviewCandidates:report.developmentTrainingReviewCandidates,
 byStyle:report.byStyle}));
