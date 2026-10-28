import test from 'node:test';import assert from 'node:assert/strict';import {assessGuardDevelopment} from '../evaluation/guard-decision.mjs';
test('guard development requires isolated control, paired suite results and fixed-reference recovery',()=>{
 const games=[];for(const suite of ['general','maze'])for(let openingIndex=0;openingIndex<3;openingIndex++)for(const candidateSide of [0,1])games.push({suite,openingIndex,candidateSide,result:candidateSide===0?'win':'draw'});
 const report={status:'completed',pairs:3,games,summary:{win:6,loss:0},baseline:'speed',baselineIdentity:{build:'speed'},identity:{build:'guard'},ms:500,cores:4,maxPlies:180,cohort:'search67-v1',tactics:Array.from({length:16},()=>({pass:true})),timing:{candidate:{moves:100,overruns:0}}};
 const proof={speedIdentity:{build:'speed'},identity:{build:'guard'},summary:{fixedChecks:24,allFixedScoresMovesNodesMatch:true}};
 assert.equal(assessGuardDevelopment(report,proof).advanceToValidation,true);
 for(const mutate of [x=>x.report.baseline='original',x=>x.report.games.pop(),x=>x.report.games.filter(g=>g.suite==='maze').forEach(g=>g.result='loss'),x=>x.proof.summary.allFixedScoresMovesNodesMatch=false,x=>x.proof.identity.build='other',x=>x.report.tactics[0].pass=false,x=>x.report.timing.candidate.overruns=5]){
  const x=structuredClone({report,proof});mutate(x);assert.equal(assessGuardDevelopment(x.report,x.proof).advanceToValidation,false);
 }
});
