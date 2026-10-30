import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analysisBudget} from '../src/analysis-budget.js';
import {analysisReadiness} from '../src/analysis-readiness.js';
import {apply} from '../src/engine.js';
const game=JSON.parse(readFileSync(new URL('../evaluation/fixtures/game7-record.json',import.meta.url),'utf8'));
let state=game.baseState;for(const a of game.records.slice(0,8))state=apply(state,a);
assert.equal(state.walls.length,3);
const action={type:'move',x:4,y:4};
const result=depth=>({depth,score:100,pv:[action],threatDefense:{active:false,complete:true},connectionRisk:{active:false,complete:true,distances:[7,7]},reserveDefense:{complete:true},weakWallConsumption:{complete:true}});
for(const depth of [4,5]){
 const latest=result(depth),history=[result(depth-2),result(depth-1),latest];
 const budget=analysisBudget(state,latest,history,6000);
 assert.equal(budget.stop,false);assert.equal(budget.reason,'horizon');
 latest.analysisBudget=budget;
 const view=analysisReadiness({active:true,displayed:latest,latest,history,elapsedMs:6000,lastUpdateAt:performance.now()-4000,reason:budget.reason});
 assert.equal(view.level,'wait');
}
const latest=result(6);
assert.equal(analysisBudget(state,latest,[result(4),result(5),latest],6000).stop,true);
assert.equal(analysisBudget({...state,walls:[]},result(4),[result(2),result(3),result(4)],6000).stop,true);
assert.equal(analysisBudget(state,{...result(0),exact:true},[],0).reason,'exact');
assert.equal(analysisBudget({...state,left:[0,10]},result(4),[result(2),result(3),result(4)],6000).reason,'reserve');
console.log('Detour auto-stop and readiness regression checks passed.');
