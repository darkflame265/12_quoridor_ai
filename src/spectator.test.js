import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {initial,clone,apply} from './engine.js';
import {SpectatorRunner,observationOutcome,positionKey,replayRecords} from './spectator.js';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function harness(start=initial()){
 let state=clone(start),past=[],records=[],errors=[],analyses=[],cancellations=0,id=0;const requests=[],timers=new Map();
 const runner=new SpectatorRunner({getState:()=>state,getOutcome:()=>observationOutcome(state,past),
  search:(s,onProgress)=>new Promise((resolve,reject)=>requests.push({state:s,onProgress,resolve,reject})),
  cancelSearch:()=>{cancellations++;},commit:action=>{past.push(clone(state));records.push(action);state=apply(state,action);},
  onAnalysis:r=>analyses.push(r),onError:e=>errors.push(e),getDelay:()=>350,
  setTimer:callback=>{timers.set(++id,callback);return id;},clearTimer:key=>timers.delete(key)});
 return {runner,requests,timers,errors,analyses,get state(){return state;},get past(){return past;},get records(){return records;},get cancellations(){return cancellations;}};
}
const result=(x,y)=>({pv:[{type:'move',x,y}],depth:1,nodes:1,engine:'test',elapsedMs:1});
test('single-step applies exactly one legal action and stays paused',async()=>{const h=harness();h.runner.step();assert.equal(h.requests.length,1);h.requests[0].resolve(result(4,7));await flush();assert.equal(h.records.length,1);assert(!h.runner.running);assert(!h.runner.thinking);assert.equal(h.timers.size,0);assert.equal(h.state.turn,1);});
test('automatic observation alternates turns after the configured delay',async()=>{const h=harness();h.runner.start();h.runner.start();assert.equal(h.requests.length,1);h.requests[0].resolve(result(4,7));await flush();assert.equal(h.runner.phase,'waiting');assert.equal(h.requests.length,1);const next=[...h.timers.values()][0];h.timers.clear();next();assert.equal(h.requests.length,2);assert.equal(h.requests[1].state.turn,1);h.requests[1].resolve(result(4,1));await flush();assert.equal(h.records.length,2);h.runner.pause();});
test('pause during thinking discards both late analysis and the completed move',async()=>{const h=harness();h.runner.start();h.runner.pause();h.requests[0].onProgress(result(4,7));h.requests[0].resolve(result(4,7));await flush();assert.equal(h.records.length,0);assert.equal(h.analyses.length,0);assert.equal(h.runner.phase,'paused');assert.equal(h.timers.size,0);});
test('pause during waiting cancels even an already dispatched timer',async()=>{const h=harness();h.runner.start();h.requests[0].resolve(result(4,7));await flush();const stale=[...h.timers.values()][0];h.runner.pause();stale();await flush();assert.equal(h.requests.length,1);assert.equal(h.records.length,1);assert.equal(h.timers.size,0);});
test('restart rejects stale results from the old observation generation',async()=>{const h=harness();h.runner.start();h.runner.pause();h.runner.step();h.requests[0].resolve(result(3,8));h.requests[1].resolve(result(4,7));await flush();assert.deepEqual(h.records,[{type:'move',x:4,y:7}]);});
test('invalid engine output pauses without changing the position',async()=>{const h=harness();h.runner.start();h.requests[0].resolve(result(0,0));await flush();assert.equal(h.records.length,0);assert.equal(h.errors.length,1);assert(!h.runner.running);assert(!h.runner.thinking);});
test('winning move finishes observation and schedules no extra computation',async()=>{const s=initial();s.p[0]={x:0,y:1};const h=harness(s);h.runner.start();h.requests[0].resolve(result(0,0));await flush();assert.equal(h.state.winner,0);assert.equal(h.runner.phase,'finished');assert.equal(h.timers.size,0);h.runner.start();assert.equal(h.requests.length,1);});
test('observation repetition ignores wall ownership and insertion order',()=>{const s=initial();s.walls=[{x:0,y:4,o:'h',owner:0},{x:3,y:2,o:'v',owner:1}];const equivalent=clone(s);equivalent.walls.reverse();equivalent.walls.forEach(w=>w.owner=1-w.owner);assert.equal(positionKey(s),positionKey(equivalent));assert.equal(observationOutcome(s,[equivalent]),null);});
test('threefold repetition and ply cap are draws; an actual goal wins first',()=>{const s=initial();assert.deepEqual(observationOutcome(s,[clone(s),clone(s)]),{type:'draw',winner:null,reason:'repetition'});assert.equal(observationOutcome(s,[initial()],{maxPlies:1}).reason,'move-limit');s.winner=0;assert.equal(observationOutcome(s,[initial()],{maxPlies:1}).type,'win');});
test('new and legacy replay objects reconstruct identical state without trusting metadata',()=>{const records=[{type:'move',x:4,y:7},{type:'wall',x:2,y:3,o:'h'}];const legacy=replayRecords({records}),modern=replayRecords({version:2,mode:'watch',records,result:{type:'win',winner:0}});assert.deepEqual(legacy,modern);assert.equal(modern.state.winner,null);assert.equal(modern.past.length,2);assert.throws(()=>replayRecords({records:[{type:'move',x:0,y:0}]}));});
test('default browser timer wrappers do not bind a foreign receiver',async()=>{
 const originalSet=globalThis.setTimeout,originalClear=globalThis.clearTimeout,errors=[],callbacks=[];let state=initial();
 globalThis.setTimeout=function(callback){if(this!==undefined&&this!==globalThis)throw Error('Illegal invocation');callbacks.push(callback);return 1;};
 globalThis.clearTimeout=function(){if(this!==undefined&&this!==globalThis)throw Error('Illegal invocation');};
 let runner;
 try{runner=new SpectatorRunner({getState:()=>state,getOutcome:()=>null,search:async()=>result(4,7),cancelSearch:()=>{},commit:a=>{state=apply(state,a);},onError:e=>errors.push(e)});runner.start();await flush();assert.equal(errors.length,0);assert.equal(callbacks.length,1);runner.pause();}
 finally{globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;}
});
test('the downloaded browser match preserves settings and replays to the displayed winner',async()=>{
 const data=JSON.parse(await readFile(new URL('../reports/spectator-browser-game.json',import.meta.url)));const r=replayRecords(data);
 assert.equal(data.mode,'watch');assert.equal(r.records.length,80);assert.equal(r.state.winner,1);assert.deepEqual(data.watch.players.map(p=>p.engine),['atlas4','atlas3']);
});
