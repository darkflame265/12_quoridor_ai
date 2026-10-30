import assert from 'node:assert/strict';
import {readFile,mkdir,access} from 'node:fs/promises';
import {execFile,spawn} from 'node:child_process';
import {promisify} from 'node:util';
import {runtimeFingerprint} from './runtime-identity.mjs';
const run=promisify(execFile),url='http://127.0.0.1:12324';
const state=async()=>JSON.parse(await readFile('.local-app/running.json','utf8'));
async function verify(s){
 assert.equal(s.url,url);
 const health=await fetch(url+'/__app/health',{headers:{Authorization:`Bearer ${s.token}`},signal:AbortSignal.timeout(2000)});
 assert.equal(health.status,200);
 const info=await health.json();assert.equal(info.service,'quoridor-play-v1');
 assert.equal(info.fingerprint,await runtimeFingerprint(process.cwd()));
 assert.equal((await fetch(url)).status,200);
}
const first=await state();await verify(first);
await run(process.execPath,['scripts/play.mjs','--no-open','--no-build'],{timeout:10000,windowsHide:true});
assert.equal((await state()).pid,first.pid,'reuse must not replace the server');
const folder='.local-app/fixed-port-conflict-check';await mkdir(folder,{recursive:true});
await assert.rejects(run(process.execPath,['scripts/play.mjs','--no-open','--no-build','--state-dir',folder],{timeout:10000,windowsHide:true}),e=>e.code===1&&e.stderr.includes('12324'));
await assert.rejects(access(folder+'/running.json'));
await verify(await state());
const child=spawn(process.execPath,['scripts/play.mjs','--restart','--no-open','--no-build'],{detached:true,stdio:'ignore',windowsHide:true});child.unref();
let restarted=false;
for(let i=0;i<60;i++){
 await new Promise(r=>setTimeout(r,250));
 try{const s=await state();if(s.pid!==first.pid){await verify(s);restarted=true;break;}}catch{}
}
assert.ok(restarted,'restart must return to the same address');
console.log('Fixed URL, current version, reuse, port conflict, and restart checks passed.');
