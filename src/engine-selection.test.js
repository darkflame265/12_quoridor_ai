import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveEngine} from './adaptive-engine.js';
import {NativeClient} from './native-client.js';
import {initial} from './engine.js';

test('experimental selection fails explicitly instead of searching a different engine',async()=>{
 let webCalls=0;const statuses=[];
 const web={size:1,cancel(){},dispose(){},async search(){webCalls++;return {pv:[]};}};
 const native={online:false,cancel(){},dispose(){},async probe(){return false;}};
 const engine=new AdaptiveEngine({engine:'atlas-experiment',webPool:web,nativeClient:native,onStatus:s=>statuses.push(s)});
 await assert.rejects(engine.search(initial()),/실험 엔진/);assert.equal(webCalls,0);assert.equal(statuses.at(-1),'unavailable');
 native.online=true;native.search=async()=>{throw Error('engine stopped');};
 await assert.rejects(engine.search(initial()),/실험 엔진/);assert.equal(webCalls,0);engine.dispose();
});
test('pressure rejects old versions and different builds without sending a search',async()=>{
 for(const info of [{version:'0.1 experiment',build:'current'},{version:'0.2 experiment',build:'old'},{build:'current'}]){
  const urls=[],statuses=[],client=new NativeClient({base:'/api/pressure',expectedPressureBuild:'current',fetcher:async url=>{urls.push(url);return new Response(JSON.stringify({service:'quoridor-native-v1',engineInfo:{id:'atlas-pressure',...info}}));},onStatus:s=>statuses.push(s)});
  assert.equal(await client.probe(),false);assert.equal(statuses.at(-1),'stale');await assert.rejects(client.search(initial(),{ms:500,cores:4}),/버전/);assert.deepEqual(urls,['/api/pressure/health']);client.dispose();
 }
});

test('experimental probe uses its own endpoint and reports engine metadata',async()=>{
 const requests=[],updates=[];const info={service:'quoridor-native-v1',engineInfo:{id:'atlas-experiment',version:'5.9 experiment',variant:'late-full'}};
 const client=new NativeClient({base:'/api/experimental',fetcher:async url=>{requests.push(url);return new Response(JSON.stringify(info));},onStatus:(status,details)=>updates.push({status,details})});
 assert.equal(await client.probe(),true);assert.deepEqual(requests,['/api/experimental/health']);assert.equal(updates[0].details.engineInfo.variant,'late-full');client.dispose();
});
test('pressure selection fails explicitly and never falls back to a different engine',async()=>{
 let webCalls=0;const web={size:1,cancel(){},dispose(){},async search(){webCalls++;return {pv:[]};}},native={online:false,cancel(){},dispose(){},async probe(){return false;}};
 const engine=new AdaptiveEngine({engine:'atlas-pressure',webPool:web,nativeClient:native});await assert.rejects(engine.search(initial()),/실험 엔진/);assert.equal(webCalls,0);engine.dispose();
});
test('pressure probe requires the correct engine identity at its independent endpoint',async()=>{
 for(const id of ['atlas-pressure','atlas-experiment','atlas5']){const requests=[],client=new NativeClient({base:'/api/pressure',fetcher:async url=>{requests.push(url);return new Response(JSON.stringify({service:'quoridor-native-v1',engineInfo:{id,version:'0.2 experiment',build:'current'}}));}});assert.equal(await client.probe(),id==='atlas-pressure');assert.deepEqual(requests,['/api/pressure/health']);client.dispose();}
});
test('tempo uses its own identity, version and build contract',async()=>{
 for(const [id,version,ok]of [['atlas-tempo','0.3 experiment',true],['atlas-pressure','0.2 experiment',false],['atlas-tempo','0.2 experiment',false]]){
  const client=new NativeClient({base:'/api/tempo',expectedPressureBuild:'current',fetcher:async()=>new Response(JSON.stringify({service:'quoridor-native-v1',engineInfo:{id,version,build:'current'}}))});assert.equal(await client.probe(),ok);client.dispose();
 }
 let webCalls=0;const engine=new AdaptiveEngine({engine:'atlas-tempo',webPool:{size:1,cancel(){},dispose(){},search(){webCalls++;}},nativeClient:{online:false,probe:async()=>false,cancel(){},dispose(){}}});await assert.rejects(engine.search(initial()),/실험 엔진/);assert.equal(webCalls,0);engine.dispose();
});
test('goal safety requires its own 0.4 identity and never falls back',async()=>{
 for(const [id,version,ok]of [['atlas-goal','0.4 experiment',true],['atlas-tempo','0.3 experiment',false],['atlas-goal','0.3 experiment',false]]){
  const client=new NativeClient({base:'/api/goal',expectedPressureBuild:'current',fetcher:async()=>new Response(JSON.stringify({service:'quoridor-native-v1',engineInfo:{id,version,build:'current'}}))});assert.equal(await client.probe(),ok);client.dispose();
 }
 const engine=new AdaptiveEngine({engine:'atlas-goal',webPool:{size:1,cancel(){},dispose(){},search(){throw Error('unexpected fallback');}},nativeClient:{online:false,probe:async()=>false,cancel(){},dispose(){}}});await assert.rejects(engine.search(initial()),/실험 엔진/);engine.dispose();
});
