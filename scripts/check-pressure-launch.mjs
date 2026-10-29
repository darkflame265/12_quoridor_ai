import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {initial,legal} from '../src/engine.js';
const dir=path.resolve('native-engine','target',`pressure-launch-qa-${Date.now()}`),child=spawn(process.execPath,['scripts/play.mjs','--no-open','--no-build','--state-dir',dir],{windowsHide:true,stdio:['ignore','pipe','pipe']});
let output='',state;child.stdout.on('data',b=>{output+=b;});child.stderr.on('data',b=>{output+=b;});
try{
 const end=Date.now()+90000;while(Date.now()<end){if(child.exitCode!==null)throw Error(output);try{state=JSON.parse(await readFile(path.join(dir,'running.json'),'utf8'));if(state.url)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 if(!state?.url)throw Error('Launcher startup timed out');
 const health=await(await fetch(state.url+'/api/pressure/health')).json();assert.equal(health.engineInfo.id,'atlas-pressure');
 const response=await fetch(state.url+'/api/pressure/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:'launcher-pressure',session:'isolated-launch-qa',state:initial(),ms:100,cores:1})});assert.ok(response.ok);const result=(await response.text()).trim().split('\n').map(JSON.parse).at(-1);assert.ok(legal(initial(),result.pv[0]));assert.match(result.engine,/immediate pressure/);
 await mkdir('reports/immediate-pressure',{recursive:true});await writeFile('reports/immediate-pressure/launch.json',JSON.stringify({status:'passed',separateStateDirectory:true,openedBrowser:false,engineInfo:health.engineInfo,legalResult:true,proxy:'/api/pressure'},null,2)+'\n');console.log('Isolated launcher and pressure proxy passed');
}finally{
 if(state?.url)await fetch(state.url+'/__app/stop',{method:'POST',headers:{Authorization:`Bearer ${state.token}`}}).catch(()=>{});
 if(child.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{child.kill();resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();});});
}
