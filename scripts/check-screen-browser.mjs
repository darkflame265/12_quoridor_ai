// Isolated UI smoke: synthetic capture/service; real Sigma inference is tested
// separately by check-sigma-runtime.mjs. No user browser/profile is accessed.
import assert from 'node:assert/strict';import http from 'node:http';import path from 'node:path';
import {readFile,writeFile,mkdir,access,rm} from 'node:fs/promises';import {spawn,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {moves} from '../src/engine.js';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist'),out=path.join(root,'reports/project-cleanup');
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:root,stdio:'inherit',windowsHide:true});await mkdir(out,{recursive:true});
let browserPath;for(const candidate of [process.env.SCREEN_QA_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].filter(Boolean)){try{await access(candidate);browserPath=candidate;break;}catch{}}
if(!browserPath)throw Error('Chrome or Edge is required for UI smoke');
const temp=path.resolve('.local-app','qa-'+Date.now()),profile=path.join(temp,'profile');await mkdir(temp,{recursive:true});
const fixtures={'/_qa/context.mjs':'scripts/test-fixtures/source-screen.mjs','/_qa/screen-board.mjs':'scripts/test-fixtures/screen-board.mjs'};
const server=http.createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),engine=url.pathname.match(/^\/api\/(sigma[234])\/(health|search|cancel)$/);
 if(engine){
  if(engine[2]==='health'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'quoridor-native-v1',engineInfo:{id:engine[1],label:engine[1],build:'ui-fixture',version:'test'}}));return;}
  let body='';for await(const chunk of req)body+=chunk;const data=JSON.parse(body);
  if(engine[2]==='cancel'){res.end('{}');return;}
  res.setHeader('Content-Type','application/x-ndjson');res.end(JSON.stringify({id:data.id,done:true,pv:[{type:'move',...moves(data.state)[0]}],depth:1,score:0,nodes:1,elapsedMs:1})+'\n');return;
 }
 const file=fixtures[url.pathname]?path.join(root,fixtures[url.pathname]):path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':url.pathname));
 if(!file.startsWith(dist+path.sep)&&!Object.values(fixtures).some(f=>file===path.join(root,f))){res.writeHead(403).end();return;}
 const bytes=await readFile(file);res.setHeader('Content-Type',/\.(js|mjs)$/.test(file)?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let chrome,ws,session,stderr='',counter=0;const pending=new Map(),errors=[],checks=[];
async function send(method,params={},target=session){const id=++counter;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},15000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
async function until(expression){const end=Date.now()+10000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+expression);}
try{
 chrome=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Browser startup failed')),15000);chrome.on('error',reject);chrome.stderr.on('data',b=>{stderr+=b;const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
 ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);});
 const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Browser.setDownloadBehavior',{behavior:'deny'},null);
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port});await until(`!!document.querySelector('#screen-wallz')`);
 for(const id of ['play-engine','watch-engine-0','watch-engine-1'])assert.deepEqual((await evaluate(`[...document.querySelector('#${id}').options].map(o=>o.value)`)).sort(),['sigma2','sigma3','sigma4']);checks.push('all three engine selectors contain only Sigma2/3/4');
 await evaluate(`(async()=>{const {paintSourceScreen}=await import('/_qa/context.mjs');window.qaSource=document.createElement('canvas');window.qaStream=null;window.qaPaint=o=>{paintSourceScreen(qaSource,{rounded:true,muted:true,labelSize:8,size:8,...o});qaStream?.getVideoTracks()[0].requestFrame?.();};qaPaint({bottom:0,relative:'opponent',plies:12});Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{qaStream=qaSource.captureStream(30);return qaStream;}});document.querySelector('#screen-auto-hint').checked=false;document.querySelector('#screen-wallz').click();})()`);
 await until(`document.querySelector('#screen-connection').textContent.includes('활성')&&!document.querySelector('#screen-dialog').open`);checks.push('Wallz capture recognizes, auto-applies and starts monitoring');
 await evaluate(`document.querySelector('#screen-resync').click()`);await until(`!document.querySelector('#screen-dialog').open&&document.querySelector('#screen-connection').textContent.includes('활성')`);checks.push('current-screen resync remains automatic');
 await evaluate(`document.querySelector('#mode').value='watch';document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#watch-step').click()`);await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===1`);checks.push('spectator executes one legal fixture-service action');
 await evaluate(`(()=>{const saved=JSON.parse(localStorage.getItem('quoridor-session'));saved.engine='atlas5';const input=document.querySelector('#file'),data=new DataTransfer();data.items.add(new File([JSON.stringify(saved)],'legacy.json',{type:'application/json'}));input.files=data.files;input.dispatchEvent(new Event('change'));})()`);
 await until(`document.querySelector('#play-engine').value==='sigma4'&&document.querySelector('#engine-import-note').textContent.includes('atlas5')`);assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),1);checks.push('legacy engine game import preserves records and migrates analysis to Sigma4');
 for(const width of [1440,390]){await send('Emulation.setDeviceMetricsOverride',{width,height:1100,deviceScaleFactor:1,mobile:false});assert.equal(await evaluate(`document.documentElement.scrollWidth>innerWidth`),false);}
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'browser-smoke.json'),JSON.stringify({checks,uncaughtErrors:errors,syntheticCaptureAndService:true},null,2));console.log(JSON.stringify({checks,uncaughtErrors:errors}));
}finally{
 if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}ws.close();}
 if(chrome&&chrome.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{chrome.kill();resolve();},3000);chrome.once('exit',()=>{clearTimeout(timer);resolve();});});
 server.closeAllConnections();await new Promise(r=>server.close(r));
 if(path.dirname(profile)===temp&&temp.startsWith(path.resolve('.local-app')+path.sep))await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
