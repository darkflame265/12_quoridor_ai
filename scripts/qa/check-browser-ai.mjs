import assert from 'node:assert/strict';import http from 'node:http';import path from 'node:path';
import {readFile,writeFile,mkdir,access,rm} from 'node:fs/promises';import {spawn,execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';import {initial,legal} from '../../src/game/engine.js';
const root=fileURLToPath(new URL('../../',import.meta.url)),dist=path.join(root,'dist'),out=path.join(root,'reports/browser-ai');
execFileSync(process.execPath,['scripts/prepare-web.mjs'],{cwd:root,stdio:'inherit'});
execFileSync(process.execPath,['node_modules/vite/bin/vite.js','build'],{cwd:root,stdio:'inherit',env:{...process.env,VITE_BROWSER_AI:'1',VITE_BASE_PATH:'/12_quoridor_ai/'}});await mkdir(out,{recursive:true});
let browserPath;for(const candidate of [process.env.SCREEN_QA_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium'].filter(Boolean)){try{await access(candidate);browserPath=candidate;break;}catch{}}
if(!browserPath)throw Error('Chrome/Edge required');
const temp=path.resolve('.local-app','browser-qa-'+Date.now()),profile=path.join(temp,'profile');await mkdir(temp,{recursive:true});
const requests=[];const server=http.createServer(async(req,res)=>{requests.push(req.url);try{const pathname=new URL(req.url,'http://localhost').pathname;if(!pathname.startsWith('/12_quoridor_ai/')){res.writeHead(404).end();return;}const suffix=pathname.slice('/12_quoridor_ai/'.length);const file=path.resolve(dist,suffix||'index.html');if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}const bytes=await readFile(file);res.setHeader('Content-Type',/\.(js|mjs)$/.test(file)?'text/javascript':file.endsWith('.wasm')?'application/wasm':file.endsWith('.html')?'text/html':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(bytes);}catch{res.writeHead(404).end();}});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let chrome,ws,session,stderr='',counter=0;const pending=new Map(),errors=[],checks=[];
async function send(method,params={},target=session){const id=++counter;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('CDP timeout '+method));},60000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
async function until(expression){const end=Date.now()+60000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timed out: '+expression);}
try{
 chrome=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Browser startup failed')),15000);chrome.on('error',reject);chrome.stderr.on('data',b=>{stderr+=b;const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
 ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);});
 const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Browser.setDownloadBehavior',{behavior:'deny'},null);
 await send('Page.navigate',{url:'http://127.0.0.1:'+server.address().port+'/12_quoridor_ai/'});
 await until(`document.querySelector('#mode')?.value==='ai'&&!!document.querySelector('.move-dot')`);
 assert.equal(await evaluate(`document.querySelector('#ai-auto-hint').checked`),false);
 await evaluate(`document.querySelector('#time').value='500';document.querySelector('#time').dispatchEvent(new Event('change'));document.querySelector('#ai-auto-hint').click()`);
 await until(`!document.querySelector('#hint').disabled&&JSON.parse(localStorage.getItem('quoridor-session')).decisionLog.some(x=>x.kind==='recommendation')`);
 const log=await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).decisionLog`);assert.ok(legal(initial(),log.findLast(x=>x.kind==='recommendation').pv[0]));checks.push('opt-in human-turn automatic advice runs real browser ONNX and PUCT under project subpath');
 const workerAsset=(await readFile(path.join(dist,'index.html'),'utf8'));
 const files=await (await import('node:fs/promises')).readdir(path.join(dist,'assets'));const workerFile=files.find(x=>x.startsWith('browser-engine-worker-')&&x.endsWith('.js'));
 const fixtures=JSON.parse(await readFile(path.join(root,'tests/fixtures/sigma-browser-parity.json'),'utf8'));
 const predictions=await evaluate(`(async()=>{const w=new Worker('/12_quoridor_ai/assets/${workerFile}',{type:'module'}),fixtures=${JSON.stringify(fixtures.map(x=>x.state))},out=[];for(let i=0;i<fixtures.length;i++){out.push(await new Promise((resolve,reject)=>{w.onmessage=e=>e.data.error?reject(Error(e.data.error)):resolve({policy:Array.from(e.data.result.policy),value:e.data.result.value});w.onerror=reject;w.postMessage({type:'evaluate',id:i,state:fixtures[i]});}));}w.terminate();return out;})()`);
 for(let i=0;i<fixtures.length;i++){assert.ok(Math.abs(predictions[i].value-fixtures[i].value)<.0001);for(let j=0;j<136;j++)assert.ok(Math.abs(predictions[i].policy[j]-fixtures[i].policy[j])<.001);}
 checks.push('WASM policy/value agree with Python ONNX on four canonical encoding fixtures');
 await evaluate(`document.querySelector('.move-dot').dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:document.querySelector('.move-dot').getBoundingClientRect().x+4,clientY:document.querySelector('.move-dot').getBoundingClientRect().y+4}))`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===2`);checks.push('human move receives an actual browser AI reply without a server');
 await until(`!document.querySelector('#hint').disabled&&!!document.querySelector('#board .recommend')`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).decisionLog.findLast(x=>x.kind==='recommendation').role`),'analysis');
 checks.push('browser AI match automatically shows human advice again after the opponent reply');
 await evaluate(`document.querySelector('[data-mode="sandbox"]').click()`);
 const timings=[];
 for(const engine of ['sigma2','sigma3','sigma4']){
  const before=await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).decisionLog.filter(x=>x.kind==='recommendation').length`);
  await evaluate(`document.querySelector('#play-engine').value='${engine}';document.querySelector('#play-engine').dispatchEvent(new Event('change'));document.querySelector('#hint').click()`);
  await until(`!document.querySelector('#hint').disabled&&JSON.parse(localStorage.getItem('quoridor-session')).decisionLog.filter(x=>x.kind==='recommendation').length>${before}`);
  const result=await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).decisionLog.findLast(x=>x.kind==='recommendation')`);
  assert.equal(result.engine,engine);timings.push({engine,elapsedMs:result.elapsedMs??null});
 }
 checks.push('all three Web profiles produce completed recommendations');
 await evaluate(`document.querySelector('#time').value='variable';document.querySelector('#time').dispatchEvent(new Event('change'));document.querySelector('#hint').click()`);
 await until(`!document.querySelector('#hint').disabled&&document.querySelector('#board .recommend')!==null`);
 checks.push('variable analysis publishes a final browser recommendation');
 await evaluate(`document.querySelector('[data-mode="watch"]').click();document.querySelector('#watch-step').click()`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===3`);
 checks.push('spectator executes a real browser AI move');
 await evaluate(`document.querySelector('[data-mode="sandbox"]').click();document.querySelector('#play-engine').value='sigma2';document.querySelector('#play-engine').dispatchEvent(new Event('change'));document.querySelector('#hint').click();document.querySelector('[data-mode="screen"]').click()`);
 await new Promise(r=>setTimeout(r,800));assert.equal(await evaluate(`document.querySelector('#mode').value`),'screen');assert.equal(await evaluate(`document.querySelector('#analysis-choice').textContent.includes('Sigma')`),false);
 assert.equal(requests.some(x=>x.includes('/api/')),false);checks.push('changing mode cancels browser advice; no engine API requests occur');
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'smoke.json'),JSON.stringify({checks,errors,requests,timings},null,2));console.log(JSON.stringify({checks,errors,timings}));
}finally{
 if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}ws.close();}
 if(chrome&&chrome.exitCode===null)await new Promise(resolve=>{const timer=setTimeout(()=>{chrome.kill();resolve();},3000);chrome.once('exit',()=>{clearTimeout(timer);resolve();});});
 server.closeAllConnections();await new Promise(r=>server.close(r));
 if(path.dirname(profile)===temp&&temp.startsWith(path.resolve('.local-app')+path.sep))await rm(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100});
}
