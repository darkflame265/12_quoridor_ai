import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
const j=name=>JSON.parse(readFileSync('evaluation/'+name,'utf8'));
const bank=j('sigma4-diverse-strong-midgame-bank-20261106.json');
const odd=j('sigma4-diverse-strong-odd-perspectives-20261106.json');
const outcomes=j('sigma4-diverse-strong-outcomes-20261106.json');
assert.equal(outcomes.games.length,64);
const parents=Object.fromEntries(bank.positions.map(x=>[x.id,x]));
const records=[];
for(const prior of odd.observations){
 const parent=parents[prior.parentId];
 const games=outcomes.games.filter(x=>x.id===prior.parentId);
 if(!games.length)continue;
 assert(games.length===4&&parent);
 assert.equal(prior.split,parent.split);
 assert.equal(prior.board.turn,1-parent.board.turn);
 let s=initial();
 for(const a of prior.actions){assert(legal(s,a));s=apply(s,a);}
 assert.deepEqual(s,prior.board);
 const forced=parent.actions.at(-1);
 assert(legal(s,forced));
 assert.deepEqual(apply(s,forced),parent.board);
 const results=games.map(g=>({policy:g.policy,observedWinner:g.winner,
  oddMoverWon:g.winner===prior.board.turn,
  forcedAction:forced}));
 records.push({id:prior.id,parentId:parent.id,trajectoryGroup:prior.trajectoryGroup,
  split:prior.split,positionId:prior.positionId,ply:prior.ply,wallCount:prior.wallCount,pathGap:prior.pathGap,
  board:prior.board,forcedAction:forced,
  observedWinFraction:results.filter(x=>x.oddMoverWon).length/results.length,
  forcedConditionalObservations:results,
  interpretation:'Observed outcomes only CONDITIONAL on the fixed next move from the source trajectory. NOT independent odd-turn engine decisions and NOT training truth'});
}
assert(records.length>=8);
const report={version:'sigma4-odd-perspective-conditional-outcome-v1',
 oddPerspectivesAudited:records.length,
 independentNewSources:0,
 correlatedParentGroups:new Set(records.map(x=>x.trajectoryGroup)).size,
 evenSourceBank:bank.positions.length,
 originalMover1Positions:records.length,
 conditionalCurrentPlayerWinFraction:records.reduce((x,y)=>x+y.observedWinFraction,0)/records.length,
 development:records.filter(x=>x.split==='development').length,
 holdout:records.filter(x=>x.split==='holdout').length,
 conditions:['The source last move is FORCED from the odd state to the original even source board',
  'Subsequent outcomes are copied from the existing 64 completed games only; they do not represent independently searched odd-position continuations',
  'Adjacent prior-ply and post-ply boards belong to SAME source group and split'],
 records,trainingApproved:false,productionApproved:false};
writeFileSync('evaluation/sigma4-diverse-strong-odd-conditional-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS ODD CONDITIONAL OUTCOME AUDIT',JSON.stringify({
 previousPlyBoards:report.oddPerspectivesAudited,
 meanOddMoverObservedWins:report.conditionalCurrentPlayerWinFraction,
 correlatedParentGroups:report.correlatedParentGroups,development:report.development,holdout:report.holdout}));
