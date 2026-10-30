import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {analysisConcerns,budgetReason} from './analysis-budget.js';
import {analysisReadiness,analysisTiming,positionVerdict} from './analysis-readiness.js';
import {apply} from './engine.js';
const game=JSON.parse(fs.readFileSync(new URL('../evaluation/fixtures/game8-record.json',import.meta.url),'utf8'));
function stateAt(ply){let s=game.baseState;for(const a of game.records.slice(0,ply-1))s=apply(s,a);return s;}
const result=()=>({depth:6,score:0,pv:[{type:'move',x:4,y:4}],threatDefense:{active:true,complete:true,initialRisk:0,selected:{risk:0}},connectionRisk:{complete:true,distances:[8,8]},reserveDefense:{complete:true},weakWallConsumption:{complete:true}});
function view(r,state){return {latest:r,displayed:r,state,active:true,elapsedMs:7000,lastUpdateAt:performance.now()-5000,history:[{...r,depth:r.depth-2},{...r,depth:r.depth-1},r]};}
test('game8 shallow stable wall streak reports both conditions instead of a ready label',()=>{
 const r={...result(),depth:5,analysisBudget:{reason:'wall-streak'}},s=stateAt(13),v={...view(r,s),wallStreak:2};
 const reasons=analysisConcerns(s,r,2);assert.ok(reasons.includes('horizon'));assert.ok(reasons.includes('wall-streak'));
 const guidance=analysisReadiness(v);assert.equal(guidance.level,'wait');assert.ok(guidance.reason.includes('연속 벽'));assert.ok(guidance.reason.includes('깊은 후보'));
});
test('game8 high risk cannot become low benefit or ready merely from stale results or stable scores',()=>{
 for(const ply of [23,51]){
  const r=result();r.threatDefense.initialRisk=6;r.threatDefense.selected.risk=3;
  const v=view(r,stateAt(ply)),g=analysisReadiness(v);assert.equal(g.level,'wait');assert.ok(g.reason.includes('방어'));
  v.active=false;assert.ok(analysisReadiness(v).label.includes('검토 사항 남음'));
 }
});
test('lack of fresh completed results does not claim low benefit; stable advice is only tentative',()=>{
 const r=result(),v=view(r);v.history=[];
 const stale=analysisReadiness(v);assert.equal(stale.level,'wait');assert.ok(stale.reason.includes('판단할 수 없습니다'));
 const stable=analysisReadiness(view(r));assert.equal(stable.level,'ready');assert.ok(stable.label.includes('잠정'));assert.ok(!stable.label.includes('착수 가능'));
 v.active=false;assert.ok(analysisReadiness(v).label.includes('추정'));
});
test('exact outcomes and ordinary score predictions have distinct verdicts',()=>{
 for(const outcome of [1,0,-1]){
  const r={...result(),exact:true,outcome};r.threatDefense.selected.risk=8;
  assert.equal(analysisConcerns(stateAt(51),r,8).length,0);
  assert.equal(analysisReadiness({...view(r),active:false}).label,'정확 종반 계산 완료');
  assert.ok(positionVerdict(r).includes('정확 종반 판정'));
 }
 assert.ok(positionVerdict({...result(),score:-29998}).includes('예상'));
 assert.ok(positionVerdict(result(),true).startsWith('최신 계산 기준'));
});
test('suppression and pinned disagreement keep precedence over stable advice',()=>{
 const r=result(),v=view(r);
 assert.equal(analysisReadiness(v,{suppressed:true}).label,'화면 재확인 중');
 assert.ok(analysisReadiness({...v,pinned:true,displayed:{...r,pv:[{type:'move',x:3,y:3}]}}).label.includes('다릅니다'));
});
test('timing shows measured completed depth and budget rather than a promised update time',()=>{
 const text=analysisTiming({...view(result()),elapsedMs:7000,limitMs:15000},performance.now());
 assert.ok(text.includes('예산 잔여 8.0초'));assert.ok(text.includes('완료 깊이 6'));assert.ok(text.includes('시점은 미정'));assert.ok(!text.includes('이내'));
 assert.ok(budgetReason('horizon').includes('깊은 후보'));assert.ok(!budgetReason('horizon').includes('?'));
});
