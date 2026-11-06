import test from 'node:test';
import assert from 'node:assert/strict';
import {ScreenPonder,ponderKey} from '../../src/ai/screen-ponder.js';
import {initial} from '../../src/game/engine.js';
const state=initial(), options={wallStreak:0,defenseReply:null};
const engine={native:{info:{engineInfo:{build:'fixture-build'}}}};
const result={pv:[{type:'move',x:4,y:7}],depth:5};
test('ponder cache exposes only complete matching engine results',()=>{
 const p=new ScreenPonder(),key=ponderKey(state,options);
 const entry={engine,build:'fixture-build',at:Date.now(),result,computeMs:1200};
 p.cache.set(key,{...entry,complete:false});
 assert.equal(p.take(engine,state,options),null);
 p.cache.set(key,{...entry,complete:true});
 assert.equal(p.take(engine,state,options).depth,5);
 assert.equal(p.take({native:{info:{engineInfo:{build:'fixture-build'}}}},state,options),null);
 assert.equal(p.take(engine,state,{...options,wallStreak:1}),null);
 p.cache.set(key,{...entry,complete:true,build:'older-build'});
 assert.equal(p.take(engine,state,options),null);
});
