import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {createNativeService} from '../server/native-service.mjs';
import {AdaptiveEngine} from './adaptive-engine.js';
import {initial,legal} from './engine.js';
import {tactics,checkTactic} from '../evaluation/suite.js';

test('native persistent process: tactics, cancellation and reuse',{skip:!existsSync(nativeExecutable)},async()=>{
 const client=new NativeProcess({profile:'candidate'});try{
  await client.health();const pid=client.child.pid;
  for(const fixture of tactics()){const result=await client.search(fixture.state,{ms:100,cores:4});assert.ok(checkTactic(fixture,result.pv[0]),fixture.id);}
  const promise=client.search(initial(),{id:'cancel-test',ms:3000,cores:4});const rejection=assert.rejects(promise,{name:'AbortError'});client.cancel('cancel-test');await rejection;
  const result=await client.search(initial(),{ms:60,cores:4});assert.ok(legal(initial(),result.pv[0]));assert.equal(client.child.pid,pid);assert.equal(client.starts,1);
 }finally{client.close();}
});
test('local native HTTP: validate requests and stream results',{skip:!existsSync(nativeExecutable)},async()=>{
 const service=createNativeService();await new Promise(resolve=>service.server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${service.server.address().port}`;
 try{
  assert.equal((await fetch(base+'/health',{headers:{Origin:'https://example.com'}})).status,403);
  assert.equal((await fetch(base+'/health')).status,200);
  const post=body=>fetch(base+'/search',{method:'POST',body:JSON.stringify(body)});
  assert.equal((await post({id:'invalid'})).status,400);
  const response=await post({id:'http-test',session:'test',state:initial(),ms:80,cores:4});assert.equal(response.status,200);
  const lines=(await response.text()).trim().split('\n').map(JSON.parse),last=lines.at(-1);assert.equal(last.done,true);assert.ok(legal(initial(),last.pv[0]));
  const running=await post({id:'long-search',session:'test',state:initial(),ms:3000,cores:4});
  assert.equal((await post({id:'busy',session:'another-page',state:initial(),ms:50,cores:1})).status,409);
  const replacement=await post({id:'replace',session:'test',state:initial(),ms:60,cores:4});
  const cancelled=(await running.text()).trim().split('\n').map(JSON.parse).at(-1);assert.equal(cancelled.cancelled,true);
  const replaced=(await replacement.text()).trim().split('\n').map(JSON.parse).at(-1);assert.ok(legal(initial(),replaced.pv[0]));
 }finally{await service.close();}
});
test('adaptive engine prefers native, falls back, and suppresses cancelled results',async()=>{
 let webCalls=0,resolveWeb;const web={size:4,cancel(){},dispose(){},async search(){webCalls++;return {pv:[],engine:'web'};}};
 const native={online:true,cancel(){},dispose(){},probe:async()=>true,search:async()=>({pv:[],engine:'native'})};
 const engine=new AdaptiveEngine({webPool:web,nativeClient:native});assert.equal((await engine.search(initial())).engine,'native');assert.equal(webCalls,0);
 native.search=async()=>{throw Error('service stopped');};assert.equal((await engine.search(initial())).backend,'wasm');assert.equal(webCalls,1);
 native.probe=async()=>false;web.search=()=>new Promise(resolve=>{resolveWeb=resolve;});const pending=engine.search(initial());await new Promise(resolve=>setImmediate(resolve));engine.cancel();resolveWeb({pv:[]});await assert.rejects(pending,{name:'AbortError'});engine.dispose();
});
test('owned local service shuts down through IPC on Windows too',{skip:!existsSync(nativeExecutable),timeout:10000},async()=>{
 const child=spawn(process.execPath,['server/native-service.mjs'],{env:{...process.env,QUORIDOR_NATIVE_PORT:'0'},stdio:['ignore','pipe','inherit','ipc'],windowsHide:true});
 try{let output='';const url=await new Promise((resolve,reject)=>{child.once('error',reject);child.stdout.on('data',chunk=>{output+=chunk;const found=output.match(/http:\/\/127\.0\.0\.1:\d+/);if(found)resolve(found[0]);});});assert.equal((await fetch(url+'/health')).status,200);const exit=once(child,'exit');child.send({op:'shutdown'});assert.equal((await exit)[0],0);}
 finally{if(child.exitCode===null)child.kill();}
});
