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

test('experimental probe uses its own endpoint and reports engine metadata',async()=>{
 const requests=[],updates=[];const info={service:'quoridor-native-v1',engineInfo:{id:'atlas-experiment',version:'5.9 experiment',variant:'late-full'}};
 const client=new NativeClient({base:'/api/experimental',fetcher:async url=>{requests.push(url);return new Response(JSON.stringify(info));},onStatus:(status,details)=>updates.push({status,details})});
 assert.equal(await client.probe(),true);assert.deepEqual(requests,['/api/experimental/health']);assert.equal(updates[0].details.engineInfo.variant,'late-full');client.dispose();
});
