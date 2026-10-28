import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {initial} from './engine.js';

test('play launcher serves built game, proxies native AI, reuses instance and stops owned services',async()=>{
 const folder=await mkdtemp(path.join(tmpdir(),'quoridor-play-'));
 let output='';const run=(extra=[])=>{const child=spawn(process.execPath,['scripts/play.mjs','--no-open','--state-dir',folder,...extra],{windowsHide:true,stdio:['ignore','pipe','pipe']});child.stdout.on('data',x=>output+=x);child.stderr.on('data',x=>output+=x);return child;};
 const exited=child=>new Promise(resolve=>{if(child.exitCode!==null)return resolve(child.exitCode);child.once('exit',resolve);});
 const child=run();const done=exited(child);let state;
 try{
  for(let i=0;i<100;i++){
   try{state=JSON.parse(await readFile(path.join(folder,'running.json'),'utf8'));if(state.url)break;}catch{}
   if(child.exitCode!==null)throw Error(output);await new Promise(r=>setTimeout(r,100));
  }
  assert.ok(state?.url,output);assert.equal(state.pid,child.pid);
  const html=await fetch(state.url);assert.equal(html.status,200);assert.match(await html.text(),/<html/);
  const health=await fetch(state.url+'/api/native/health');assert.equal(health.status,200);assert.equal((await health.json()).service,'quoridor-native-v1');
  assert.equal((await fetch(state.url+'/__app/stop',{method:'POST'})).status,403);
  const duplicate=run();assert.equal(await exited(duplicate),0,output);
  assert.equal(JSON.parse(await readFile(path.join(folder,'running.json'),'utf8')).pid,child.pid);
  const result=await fetch(state.url+'/api/native/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'launcher-test',session:'launcher-test',state:initial(),ms:25,cores:1})});
  assert.equal(result.status,200);const lines=(await result.text()).trim().split('\n').map(x=>JSON.parse(x));
  assert.ok(lines.some(x=>x.done&&!x.error),JSON.stringify(lines));
  const stop=run(['--stop']);assert.equal(await exited(stop),0,output);assert.equal(await done,0,output);
  await assert.rejects(readFile(path.join(folder,'running.json')));
  await assert.rejects(fetch(state.url));
 }finally{
  if(child.exitCode===null){if(state?.url)await fetch(state.url+'/__app/stop',{method:'POST',headers:{Authorization:`Bearer ${state.token}`}}).catch(()=>{});else child.kill();}
  await done;assert.ok(path.resolve(folder).startsWith(path.resolve(tmpdir())+path.sep));assert.ok(path.basename(folder).startsWith('quoridor-play-'));await rm(folder,{recursive:true,force:true});
 }
});
