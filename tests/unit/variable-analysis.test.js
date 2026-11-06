import test from 'node:test';
import assert from 'node:assert/strict';
import {VariableAnalysis} from '../../src/ai/variable-analysis.js';
import {initial} from '../../src/game/engine.js';
function harness(t){
 let time=0;t.mock.timers.enable({apis:['setTimeout','setInterval']});t.mock.method(performance,'now',()=>time);
 const tick=ms=>{time+=ms;t.mock.timers.tick(ms);};
 let progress,resolve;const shown=[],errors=[];let cancelled=0,options;
 const engine={search(s,o){options=o;progress=o.onProgress;return new Promise(r=>resolve=r);},cancel(){cancelled++;}};
 const v=new VariableAnalysis(),start=initial();
 const begin=initialResult=>v.start(engine,start,{cores:4,initialResult,onPublish:r=>shown.push(r),onError:e=>errors.push(e)});
 const result=(depth,x=4,extra={})=>({depth,score:0,pv:[{type:'move',x,y:7}],connectionRisk:{active:false,complete:true,distances:[8,8]},reserveDefense:{complete:true},weakWallConsumption:{complete:true},...extra});
 return {v,begin,tick,result,shown,errors,send:r=>progress(r),done:r=>resolve(r),get cancelled(){return cancelled;},get options(){return options;}};
}
test('changing candidates stay hidden until 2s, then freeze despite late results',async t=>{
 const h=harness(t),task=h.begin();assert.equal(h.options.ms,2000);
 h.send(h.result(2));h.tick(500);assert.equal(h.shown.length,0);
 h.send(h.result(3,3));h.tick(1000);h.send(h.result(4,5));assert.equal(h.shown.length,0);
 h.tick(500);assert.equal(h.shown.length,1);assert.equal(h.shown[0].pv[0].x,5);assert.equal(h.cancelled,1);assert.equal(h.v.active,false);
 h.send(h.result(9,2));h.done(h.result(10,1));await task;h.v.togglePin();assert.equal(h.shown.length,1);assert.equal(h.v.displayed.pv[0].x,5);
});
test('stable completed depths can finalize at 0.5s, including a ponder seed',async t=>{
 const h=harness(t),task=h.begin(h.result(2));h.send(h.result(3));h.send(h.result(4));assert.equal(h.shown.length,0);
 h.tick(499);assert.equal(h.shown.length,0);h.tick(1);assert.equal(h.shown.length,1);assert.equal(h.v.reason,'stable');
 h.done(h.result(4));await task;
});
test('risk keeps stable candidates private until the deadline',async t=>{
 const h=harness(t),task=h.begin(),risk={threatDefense:{active:true,complete:true,initialRisk:5,selected:{risk:4}}};
 for(const d of [2,3,4])h.send(h.result(d,4,risk));h.tick(500);assert.equal(h.shown.length,0);h.tick(1500);assert.equal(h.shown.length,1);assert.equal(h.v.reason,'time-limit');h.done(h.result(5));await task;
});
test('cancelled position never publishes stale progress or a late final result',async t=>{
 const h=harness(t),task=h.begin();h.send(h.result(3));h.v.cancel();h.tick(2000);h.send(h.result(6));h.done(h.result(7));await task;assert.equal(h.shown.length,0);assert.equal(h.v.latest,null);
});
test('completed searches publish immediately; unfinished candidates remain private',async t=>{
 const h=harness(t),task=h.begin();h.done(h.result(3));await task;assert.equal(h.shown.length,1);h.tick(500);assert.equal(h.shown.length,1);
 const task2=h.begin();h.send(h.result(1,4,{exact:true,outcome:1}));assert.equal(h.shown.length,2);assert.equal(h.v.reason,'exact');h.done(h.result(2));await task2;
});
test('deadline without a completed iteration reports an error instead of inventing a move',async t=>{
 const h=harness(t),task=h.begin();h.tick(2000);assert.equal(h.shown.length,0);assert.equal(h.errors.length,1);assert.equal(h.cancelled,1);h.done(h.result(2));await task;
});
