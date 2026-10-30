import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {apply,initial,legal} from './engine.js';
import {progressSnapshot,progressReview} from './progress-review.js';
import {analysisBudget,budgetReason} from './analysis-budget.js';
import {analysisReadiness} from './analysis-readiness.js';
import {recommendation} from './decision-log.js';
const game=JSON.parse(fs.readFileSync(new URL('../evaluation/fixtures/game8-record.json',import.meta.url),'utf8'));
function position(ply){let state=game.baseState;const past=[];for(const a of game.records.slice(0,ply-1)){past.push(state);state=apply(state,a);}return {state,past};}
test('game 8 retreat and longer returns remain visible beyond four own turns',()=>{
 for(const ply of [41,49,51,53,55,57,59]){
  const {state,past}=position(ply),action=game.records[ply-1],s=progressSnapshot(state,past),before=structuredClone(state);
  const r=progressReview(s,action);assert.ok(r.active,`ply ${ply}`);assert.ok(r.windowTurns<=12);
  assert.ok(legal(state,action),'diagnostic must not ban a necessary retreat');
  assert.deepEqual(state,before);
 }
 const {state,past}=position(55),r=progressReview(progressSnapshot(state,past),game.records[54]);
 assert.ok(r.cycleTurns>4,'old four-turn window missed this return');
 assert.equal(r.opponentProgress,9);
});
test('new route progress, goal arrival, missing history and changed maze do not invent cycles',()=>{
 const {state,past}=position(41),s=progressSnapshot(state,past);
 assert.equal(progressReview(s,{type:'move',x:3,y:4}).active,false);
 assert.equal(progressReview(state,game.records[40]).active,false);
 const changed={...s,walls:[...s.walls,{x:0,y:0,o:'h',owner:1}]};
 assert.equal(progressReview(changed,game.records[40]).windowTurns,0);
 const goal={...initial(),p:[{x:4,y:1},{x:0,y:8}],ownTurnHistory:s.ownTurnHistory};
 assert.equal(progressReview(goal,{type:'move',x:4,y:0}).active,false);
});
test('predicted and actually observed opponent replies carry identical own-turn history',()=>{
 const before=position(40),actual=position(41);
 const predicted=apply(before.state,game.records[39]);
 assert.deepEqual(progressSnapshot(predicted,before.past).ownTurnHistory,progressSnapshot(actual.state,actual.past).ownTurnHistory);
});
test('suspected cycles prevent heuristic stop and ready/low labels; exact results keep priority',()=>{
 const {state,past}=position(55),s=progressSnapshot(state,past),pv=[game.records[54]],review=progressReview(s,pv[0]);
 const r={pv,score:0,depth:6,progressReview:review,threatDefense:{active:false,complete:true},connectionRisk:{active:false,complete:true}};
 const history=[{...r,depth:4},{...r,depth:5},r],budget=analysisBudget(s,r,history,7000);
 assert.equal(budget.reason,'progress');assert.equal(budget.stop,false);
 assert.ok(budgetReason(budget.reason).includes('경로'));
 assert.equal(analysisReadiness({active:true,displayed:r,latest:r,history,elapsedMs:7000,lastUpdateAt:performance.now()-5000,reason:budget.reason}).level,'wait');
 assert.equal(analysisBudget(s,{...r,exact:true},history,7000).stop,true);
 assert.deepEqual(recommendation(state,r).progressReview,review);
});
