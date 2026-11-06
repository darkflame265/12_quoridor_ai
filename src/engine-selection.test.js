import test from 'node:test';import assert from 'node:assert/strict';
import {AdaptiveEngine} from './adaptive-engine.js';import {NativeClient} from './native-client.js';import {normalizeSessionSettings,supportedEngines} from './session-settings.js';import {initial} from './engine.js';
test('only Sigma 2,3,4 are supported and removed selections migrate without losing records',()=>{
 assert.deepEqual(supportedEngines,['sigma2','sigma3','sigma4']);
 const records=[{type:'move',x:4,y:7}];const migrated=normalizeSessionSettings({engine:'atlas5',records,watch:{players:[{engine:'sigma'},{engine:'atlas-goal'}]}});
 assert.equal(migrated.engine,'sigma4');assert.equal(migrated.unsupportedEngine,'atlas5');assert.deepEqual(migrated.records,records);assert.deepEqual(migrated.watch.players.map(p=>p.engine),['sigma2','sigma4']);
 assert.throws(()=>new AdaptiveEngine({engine:'atlas5'}));assert.throws(()=>new NativeClient({base:'/api/sigma'}));
});
test('a selected engine must match its endpoint identity',async()=>{
 for(const engine of supportedEngines)for(const id of [engine,'wrong-engine']){
  const client=new NativeClient({base:'/api/'+engine,fetcher:async()=>new Response(JSON.stringify({service:'quoridor-native-v1',engineInfo:{id}}))});assert.equal(await client.probe(),id===engine);client.dispose();
 }
});
test('unavailable Sigma cannot silently fall back to another engine',async()=>{
 const statuses=[],native={online:false,probe:async()=>false,cancel(){},dispose(){}};const engine=new AdaptiveEngine({engine:'sigma2',nativeClient:native,onStatus:s=>statuses.push(s)});
 await assert.rejects(engine.search(initial()),/Sigma/);assert.equal(statuses.at(-1),'unavailable');engine.dispose();
});
test('legacy common engine/time initialize both roles; separate settings survive restore',()=>{
 const legacy=normalizeSessionSettings({settingsRevision:1,engine:'sigma3',time:'500',mode:'ai',records:[]},{startup:true});
 assert.equal(legacy.engine,'sigma3');assert.deepEqual(legacy.opponent,{engine:'sigma3',time:'500'});
 const separate=normalizeSessionSettings({...legacy,engine:'sigma4',time:'variable',opponent:{engine:'sigma2',time:'500'}},{startup:true});
 assert.equal(separate.engine,'sigma4');assert.equal(separate.time,'variable');assert.deepEqual(separate.opponent,{engine:'sigma2',time:'500'});
 assert.deepEqual(normalizeSessionSettings({...legacy,opponent:{engine:'atlas5',time:'invalid'}}).opponent,{engine:'sigma3',time:'500'});
});
