import http from 'node:http';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const dir=path.resolve('native-engine/target',`upgrade-qa-${Date.now()}`),lock=path.join(dir,'running.json');await mkdir(dir,{recursive:true});
const children=[];let finalState,oldStopped=false;
const old=http.createServer(async(req,res)=>{
 if(req.headers.authorization!=='Bearer own-test-token'){res.writeHead(403).end();return;}
 if(req.url==='/__app/health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'quoridor-play-v1'}));return;}
 if(req.url==='/__app/stop'){oldStopped=true;res.end('ok');setTimeout(async()=>{await unlink(lock);old.close();},10);return;}res.writeHead(404).end();
});await new Promise(r=>old.listen(0,'127.0.0.1',r));const url=`http://127.0.0.1:${old.address().port}`;
await writeFile(lock,JSON.stringify({url,pid:process.pid,token:'own-test-token'}));
function launch(extra=[]){const child=spawn(process.execPath,['scripts/play.mjs','--no-open','--no-build','--state-dir',dir,...extra],{windowsHide:true,stdio:['ignore','pipe','pipe']});children.push(child);let output='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>output+=b);child.output=()=>output;return child;}
async function ready(previousPid){const end=Date.now()+90000;while(Date.now()<end){try{const s=JSON.parse(await readFile(lock,'utf8'));if(s.url&&s.pid!==previousPid){const r=await fetch(s.url+'/__app/health',{headers:{Authorization:`Bearer ${s.token}`}});const h=await r.json();if(h.fingerprint)return s;}}catch{}await new Promise(r=>setTimeout(r,100));}throw Error('Upgrade startup timed out');}
async function exited(child){if(child.exitCode!==null)return child.exitCode;return await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Child did not exit')),15000);child.once('exit',code=>{clearTimeout(timer);resolve(code);});});}
try{
 launch();finalState=await ready(process.pid);assert.ok(oldStopped);assert.equal(finalState.url,url);const pid=finalState.pid;
 const reused=launch();assert.equal(await exited(reused),0);assert.equal(JSON.parse(await readFile(lock,'utf8')).pid,pid);
 launch(['--restart']);finalState=await ready(pid);assert.equal(finalState.url,url);assert.notEqual(finalState.pid,pid);
 const health=await(await fetch(url+'/api/pressure/health')).json();assert.match(health.engineInfo.version,/^0\.2 /);
 const wrong=await fetch(url+'/api/pressure/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'wrong-build',expectedBuild:'obsolete'})});assert.equal(wrong.status,409);
 const tempo=await(await fetch(url+'/api/tempo/health')).json();assert.equal(tempo.engineInfo.id,'atlas-tempo');assert.match(tempo.engineInfo.version,/^0\.3 /);
 const goal=await(await fetch(url+'/api/goal/health')).json();assert.equal(goal.engineInfo.id,'atlas-goal');assert.match(goal.engineInfo.version,/^0\.4 /);
 await mkdir('reports/runtime-upgrade',{recursive:true});await writeFile('reports/runtime-upgrade/check.json',JSON.stringify({status:'passed',legacyServerUpgraded:true,sameOriginPreserved:true,currentServerReused:true,explicitRestart:true,actualEngine:health.engineInfo},null,2)+'\n');console.log('Legacy upgrade, same origin, reuse and explicit restart passed');
}finally{
 if(finalState)await fetch(finalState.url+'/__app/stop',{method:'POST',headers:{Authorization:`Bearer ${finalState.token}`}}).catch(()=>{});
 old.closeAllConnections();old.close();for(const child of children)if(child.exitCode===null){try{await exited(child);}catch{child.kill();}}
}
