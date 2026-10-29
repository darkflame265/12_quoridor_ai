// Isolated headless browser QA of our local app. It never attaches to the
// user's browser/profile; capture is tested with our own canvas MediaStream.
import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {readFile,writeFile,mkdir,access,rm} from 'node:fs/promises';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist'),out=path.join(root,'reports','screen-import');
execFileSync(process.execPath,[path.join(root,'node_modules','vite','bin','vite.js'),'build'],{cwd:root,stdio:'inherit',windowsHide:true});
let browserPath;for(const candidate of [process.env.SCREEN_QA_CHROME,'C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','/usr/bin/chromium','/usr/bin/google-chrome'].filter(Boolean)){try{await access(candidate);browserPath=candidate;break;}catch{}}
if(!browserPath)throw Error('Set SCREEN_QA_CHROME to a Chrome/Edge executable');
const temp=path.resolve(root,'native-engine','target',`screen-qa-${Date.now()}`),profile=path.join(temp,'profile');await mkdir(temp,{recursive:true});await mkdir(out,{recursive:true});
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),file=url.pathname==='/_qa/fixture.js'?path.join(root,'scripts','test-fixtures','screen-board.mjs'):path.resolve(dist,'.'+(url.pathname==='/'?'/index.html':decodeURIComponent(url.pathname)));
 if(!file.startsWith(dist+path.sep)&&file!==path.join(root,'scripts','test-fixtures','screen-board.mjs')){res.writeHead(403);res.end();return;}
 const bytes=await readFile(file);res.setHeader('Content-Type',file.endsWith('.js')||file.endsWith('.mjs')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.html')?'text/html':file.endsWith('.wasm')?'application/wasm':'application/octet-stream');res.end(bytes);
 }catch{res.writeHead(404);res.end();}});await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const url=`http://127.0.0.1:${server.address().port}/`;
let chrome,ws,session,stderr='',counter=0;const pending=new Map(),errors=[],checks=[];
async function send(method,params={},target=session){const id=++counter;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error(`CDP timeout ${method}`));},20000);pending.set(id,{resolve,reject,timer});ws.send(JSON.stringify({id,method,params,...(target?{sessionId:target}:{})}));});}
async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description??r.exceptionDetails.text);return r.result.value;}
async function until(expression){const end=Date.now()+15000;while(Date.now()<end){if(await evaluate(expression))return;await new Promise(resolve=>setTimeout(resolve,50));}throw Error(`Condition timed out: ${expression}`);}
async function screenshot(name){const r=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});await writeFile(path.join(out,name),Buffer.from(r.data,'base64'));}
async function crop(){
 const r=await evaluate(`(()=>{const c=document.querySelector('#screen-source-canvas'),b=c.getBoundingClientRect();return {x:b.left+24/c.width*b.width,y:b.top+24/c.height*b.height,x2:b.left+536/c.width*b.width,y2:b.top+536/c.height*b.height};})()`);
 await send('Input.dispatchMouseEvent',{type:'mousePressed',x:r.x,y:r.y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r.x2,y:r.y2,button:'left',buttons:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:r.x2,y:r.y2,button:'left',clickCount:1});
}
try{
 chrome=spawn(browserPath,['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--disable-background-networking','--remote-debugging-address=127.0.0.1','--remote-debugging-port=0','--remote-allow-origins=*',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 const endpoint=await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Browser did not start: '+stderr.slice(-1500))),15000);chrome.on('error',reject);chrome.stderr.on('data',b=>{stderr+=b.toString();const m=stderr.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(m){clearTimeout(timer);resolve(m[1]);}});});
 ws=new WebSocket(endpoint);await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true});});
 ws.addEventListener('message',e=>{const r=JSON.parse(e.data);if(r.id){const p=pending.get(r.id);if(p){clearTimeout(p.timer);pending.delete(r.id);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);}}else if(r.method==='Runtime.exceptionThrown')errors.push(r.params.exceptionDetails.exception?.description??r.params.exceptionDetails.text);});
 const target=await send('Target.createTarget',{url:'about:blank'},null);session=(await send('Target.attachToTarget',{targetId:target.targetId,flatten:true},null)).sessionId;
 await send('Page.enable');await send('Runtime.enable');await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});
 await send('Browser.setDownloadBehavior',{behavior:'deny'},null);
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`if(!localStorage.getItem('quoridor-session'))localStorage.setItem('quoridor-session',JSON.stringify({version:2,records:[],mode:'sandbox',side:0,startPosition:'bottom',time:'500',cores:'1',engine:'atlas3'}));`});
 await send('Page.navigate',{url});await until(`!!document.querySelector('#screen-open')`);
 await evaluate(`(async()=>{const {screenFixture}=await import('/_qa/fixture.js');const f=screenFixture();window.qaCanvas=document.createElement('canvas');qaCanvas.width=f.width;qaCanvas.height=f.height;qaCanvas.getContext('2d').putImageData(new ImageData(f.data,f.width,f.height),0,0);const blob=await new Promise(r=>qaCanvas.toBlob(r));const transfer=new DataTransfer();transfer.items.add(new File([blob],'board.png',{type:'image/png'}));document.querySelector('#mode').value='screen';document.querySelector('#mode').dispatchEvent(new Event('change'));const input=document.querySelector('#screen-image-file');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
 await until(`!document.querySelector('#screen-source-canvas').hidden && document.querySelector('#screen-source-canvas').width===560`);
 assert.equal(await evaluate(`document.querySelectorAll('#screen-review-board circle').length`),2);
 assert.equal(await evaluate(`document.querySelectorAll('#screen-wall-list button').length`),3);
 assert.equal(await evaluate(`document.querySelector('#screen-grid-status').textContent.includes('자동 정렬 완료')`),true);
 checks.push('image import automatically finds lattice, axis spacing, pawns and walls without dragging');await crop();
 await evaluate(`document.querySelector('#screen-recognize').click();document.querySelector('#screen-turn').value='1';document.querySelector('#screen-turn').dispatchEvent(new Event('change'));`);
 await until(`!document.querySelector('#screen-apply').disabled`);
 assert.equal(await evaluate(`document.querySelector('#hint').disabled`),true);
 assert.deepEqual(await evaluate(`[document.querySelectorAll('#screen-review-board circle').length,document.querySelectorAll('#screen-wall-list button').length,document.querySelector('#screen-left-0').value,document.querySelector('#screen-left-1').value]`),[2,3,'8','9']);checks.push('image, drag calibration, recognition and stock inference');
 await evaluate(`window.qaReview=(brush,x,y)=>{document.querySelector('#screen-brush').value=brush;const s=document.querySelector('#screen-review-board svg'),r=s.getBoundingClientRect();s.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+x/400*r.width,clientY:r.top+y/400*r.height}));};qaReview('p1',195,111);qaReview('p1',195,279);`);
 assert.equal(await evaluate(`document.querySelector('#screen-apply').disabled`),true);
 await evaluate(`qaReview('p1',195,111);qaReview('v0',90,174);`);assert.equal(await evaluate(`document.querySelector('#screen-apply').disabled`),true);
 await evaluate(`document.querySelector('#screen-wall-list').lastElementChild.querySelector('button').click();document.querySelector('#screen-left-0').value='9';document.querySelector('#screen-left-0').dispatchEvent(new Event('input'));`);assert.equal(await evaluate(`document.querySelector('#screen-apply').disabled`),true);
 await evaluate(`document.querySelector('#screen-stock-reset').click()`);assert.equal(await evaluate(`document.querySelector('#screen-apply').disabled`),false);checks.push('manual pawn/wall correction and invalid-state blocking');
 await screenshot('recognition-review.png');await evaluate(`document.querySelector('#screen-apply').click()`);await until(`!document.querySelector('#screen-dialog').open`);
 const saved=await evaluate(`JSON.parse(localStorage.getItem('quoridor-session'))`);assert.equal(saved.version,3);assert.equal(saved.mode,'screen');assert.equal(saved.baseState.turn,1);assert.deepEqual(saved.baseState.p,[{x:4,y:6},{x:4,y:2}]);assert.deepEqual(saved.baseState.left,[8,9]);assert.equal(saved.records.length,0);
 await evaluate(`document.querySelector('#board').click();document.querySelector('#hint').click()`);await until(`!!document.querySelector('#board .recommend')`);assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),0);checks.push('read-only observed board and manual engine recommendation without auto-move');
 await screenshot('applied-board.png');
 const downloaded=await evaluate(`(async()=>{const original=URL.createObjectURL;URL.createObjectURL=blob=>{window.qaSavedBlob=blob;return original.call(URL,blob);};document.querySelector('#save').click();URL.createObjectURL=original;return JSON.parse(await qaSavedBlob.text());})()`);assert.deepEqual(downloaded,saved);
 await evaluate(`document.querySelector('#mode').value='sandbox';document.querySelector('#mode').dispatchEvent(new Event('change'));document.querySelector('#reset').click();const transfer=new DataTransfer();transfer.items.add(new File([JSON.stringify(${JSON.stringify(saved)})],'observed.json',{type:'application/json'}));const input=document.querySelector('#file');input.files=transfer.files;input.dispatchEvent(new Event('change'));`);
 await until(`document.querySelector('#mode').value==='screen' && document.querySelector('#count').textContent.includes('가져온')`);checks.push('saved snapshot download payload and JSON file restore');
 await send('Page.reload');await until(`document.querySelector('#count')?.textContent.includes('가져온')`);assert.equal(await evaluate(`document.querySelector('#mode').value`),'screen');
 await evaluate(`document.querySelector('#mode').value='sandbox';document.querySelector('#mode').dispatchEvent(new Event('change'));const svg=document.querySelector('#board svg'),r=svg.getBoundingClientRect();svg.dispatchEvent(new MouseEvent('click',{bubbles:true,clientX:r.left+401/664*r.width,clientY:r.top+191/664*r.height}));`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),1);assert.equal(await evaluate(`document.querySelector('#history i').style.background`),'rgb(250, 115, 147)');
 await send('Page.reload');await until(`document.querySelector('#count')?.textContent.includes('1수')`);await evaluate(`document.querySelector('#undo').click()`);assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),0);checks.push('observed-base reload, subsequent move, correct player color and undo');
 await evaluate(`(async()=>{const {screenFixture}=await import('/_qa/fixture.js');const f=screenFixture();window.qaCanvas=document.createElement('canvas');qaCanvas.width=f.width;qaCanvas.height=f.height;qaCanvas.getContext('2d').putImageData(new ImageData(f.data,f.width,f.height),0,0);window.qaCalls=0;Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{qaCalls++;window.qaStream=qaCanvas.captureStream(30);setTimeout(()=>{qaCanvas.getContext('2d').fillRect(0,0,1,1);qaStream.getVideoTracks()[0].requestFrame?.();},100);return qaStream;}});document.querySelector('#mode').value='screen';document.querySelector('#mode').dispatchEvent(new Event('change'));})()`);
 assert.equal(await evaluate(`qaCalls`),0);await evaluate(`document.querySelector('#screen-connect').click()`);await until(`window.qaStream && !document.querySelector('#screen-source-canvas').hidden`);assert.equal(await evaluate(`qaCalls`),1);
 await until(`document.querySelector('#screen-video').readyState>=2`);
 await evaluate(`document.querySelector('#screen-freeze').click()`);await crop();
 await evaluate(`document.querySelector('#screen-recognize').click();document.querySelector('#screen-bottom').value='0';document.querySelector('#screen-bottom').dispatchEvent(new Event('change'));document.querySelector('#screen-turn').value='1';document.querySelector('#screen-turn').dispatchEvent(new Event('change'));document.querySelector('#screen-apply').click();document.querySelector('#screen-auto-start').click();`);
 await until(`document.querySelector('#screen-auto-status').textContent.includes('원본과 일치')`);
 assert.equal(await evaluate(`document.querySelector('#screen-dialog').open`),false);
 await evaluate(`(async()=>{const {screenFixture}=await import('/_qa/fixture.js');window.qaDraw=(options)=>{const f=screenFixture(options);qaCanvas.getContext('2d').putImageData(new ImageData(f.data,f.width,f.height),0,0);qaStream.getVideoTracks()[0].requestFrame?.();};qaDraw({positions:[{x:4,y:6},{x:4,y:3}]});})()`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===1`);
 await until(`!!document.querySelector('#board .recommend')`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records[0].y`),3);
 checks.push('live video move auto-sync with dialog closed and own-turn automatic recommendation');
 await evaluate(`qaDraw({positions:[{x:4,y:5},{x:5,y:3}]})`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===3`);
 await until(`!!document.querySelector('#board .recommend')`);
 await evaluate(`window.qaInstalled=[{type:'wall',x:1,y:3,o:'h',owner:0},{type:'wall',x:3,y:3,o:'h',owner:0},{type:'wall',x:5,y:4,o:'v',owner:1},{type:'wall',x:0,y:0,o:'h',owner:0}];qaDraw({positions:[{x:4,y:5},{x:6,y:3}],installed:qaInstalled});`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===5`);
 assert.equal(await evaluate(`document.querySelectorAll('#board .wall').length`),4);
 assert.equal(await evaluate(`document.querySelectorAll('#players .walls-count b')[0].textContent`),'7');
 checks.push('two fast plies, wall owner, remaining stock and history synchronize together');
 await evaluate(`qaDraw({positions:[{x:4,y:1},{x:6,y:3}],installed:qaInstalled})`);
 await until(`document.querySelector('#screen-auto-status').textContent.includes('갱신 보류')`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),5);
 assert.equal(await evaluate(`!!document.querySelector('#board .recommend')`),false);
 await evaluate(`qaDraw({positions:[{x:4,y:5},{x:6,y:3}],installed:qaInstalled})`);
 await until(`document.querySelector('#screen-auto-status').textContent.includes('원본과 일치')`);
 await until(`!!document.querySelector('#board .recommend')`);
 checks.push('illegal recognition preserves last good board, clears stale hint and recovers');
 await evaluate(`document.querySelector('#screen-auto-pause').click();qaDraw({positions:[{x:4,y:4},{x:6,y:3}],installed:qaInstalled})`);
 await evaluate(`new Promise(r=>setTimeout(r,1000))`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),5);
 await evaluate(`document.querySelector('#screen-auto-start').click()`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===6`);
 assert.equal(await evaluate(`!!document.querySelector('#board .recommend')`),false);
 checks.push('pause prevents synchronization; resume catches up without suggesting on opponent turn');
 await evaluate(`document.querySelector('#screen-auto-hint').click();qaDraw({positions:[{x:4,y:4},{x:6,y:4}],installed:qaInstalled})`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===7`);
 assert.equal(await evaluate(`!!document.querySelector('#board .recommend')`),false);
 await evaluate(`document.querySelector('#screen-auto-hint').click()`);
 await until(`!!document.querySelector('#board .recommend')`);
 checks.push('automatic analysis can be disabled and re-enabled without changing the board');
 await evaluate(`document.querySelector('#screen-video').pause()`);
 await until(`document.querySelector('#screen-auto-status').textContent.includes('새 영상 프레임')`);
 assert.equal(await evaluate(`!!document.querySelector('#board .recommend')`),false);
 await evaluate(`document.querySelector('#screen-video').play()`);
 await until(`!!document.querySelector('#board .recommend')`);
 checks.push('stalled video clears stale analysis and resumes after fresh stable frames');
 await screenshot('automatic-sync.png');
 await evaluate(`document.querySelector('#screen-open').click()`);
 assert.equal(await evaluate(`document.querySelector('#screen-dialog').open && document.querySelector('#screen-auto-pause').disabled && document.querySelector('#screen-auto-start').disabled`),true);
 assert.equal(await evaluate(`!!document.querySelector('#board .recommend')`),false);
 assert.equal(await evaluate(`qaStream.getTracks().every(t=>t.readyState==='live')`),true);
 await crop(); // Explicit manual fallback must retain its resize-stop behavior.
 await evaluate(`document.querySelector('#screen-recognize').click();document.querySelector('#screen-turn').value='0';document.querySelector('#screen-turn').dispatchEvent(new Event('change'));document.querySelector('#screen-apply').click();document.querySelector('#screen-auto-start').click()`);
 await until(`!!document.querySelector('#board .recommend')`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).baseState.walls.length`),4);
 checks.push('reopening calibration pauses monitoring, freezes latest frame and requires reviewed reapplication');
 await evaluate(`qaCanvas.width=600;qaCanvas.height=600;qaCanvas.getContext('2d').fillRect(0,0,600,600);qaStream.getVideoTracks()[0].requestFrame?.()`);
 await until(`document.querySelector('#screen-auto-status').textContent.includes('크기가 바뀌었습니다')`);
 assert.equal(await evaluate(`document.querySelector('#screen-auto-start').disabled && document.querySelector('#screen-auto-pause').disabled`),true);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),0);
 checks.push('capture dimension change stops monitoring and requires a fresh crop');
 await evaluate(`document.querySelector('#screen-disconnect').click()`);assert.equal(await evaluate(`qaStream.getTracks().every(t=>t.readyState==='ended')`),true);
 await evaluate(`Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{throw new DOMException('denied','NotAllowedError');}});document.querySelector('#screen-connect').click();`);await until(`document.querySelector('#screen-message').textContent.includes('취소')`);
 await evaluate(`Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:()=>new Promise(r=>window.qaResolve=r)});document.querySelector('#screen-connect').click();document.querySelector('#mode').value='sandbox';document.querySelector('#mode').dispatchEvent(new Event('change'));window.qaPending=qaCanvas.captureStream(1);qaResolve(qaPending);`);await until(`qaPending.getTracks().every(t=>t.readyState==='ended')`);checks.push('explicit capture request, stop, denial and late permission-result cleanup using synthetic stream');
 await evaluate(`(async()=>{const {screenFixture}=await import('/_qa/fixture.js');const f=screenFixture({bottom:1}),canvas=document.createElement('canvas');canvas.width=f.width;canvas.height=f.height;canvas.getContext('2d').putImageData(new ImageData(f.data,f.width,f.height),0,0);const blob=await new Promise(r=>canvas.toBlob(r));const transfer=new DataTransfer();transfer.items.add(new File([blob],'pink-bottom.png',{type:'image/png'}));document.querySelector('#mode').value='screen';document.querySelector('#mode').dispatchEvent(new Event('change'));const input=document.querySelector('#screen-image-file');input.files=transfer.files;input.dispatchEvent(new Event('change'));})()`);
 await until(`!document.querySelector('#screen-source-canvas').hidden && document.querySelector('#screen-source-canvas').width===560 && document.querySelector('#screen-grid-status').textContent.includes('자동 정렬 완료')`);await crop();await evaluate(`document.querySelector('#screen-recognize').click();document.querySelector('#screen-bottom').value='1';document.querySelector('#screen-bottom').dispatchEvent(new Event('change'));document.querySelector('#screen-apply').click();`);await until(`!document.querySelector('#screen-dialog').open`);
 const pink=await evaluate(`JSON.parse(localStorage.getItem('quoridor-session'))`);assert.equal(pink.startPosition,'top');assert.equal(pink.sourceBottom,1);assert.deepEqual(pink.baseState.p,[{x:4,y:2},{x:4,y:6}]);assert.deepEqual(await evaluate(`[...document.querySelectorAll('#board .pawn')].map(c=>Number(c.getAttribute('cy')))`),[471,191]);await send('Page.reload');await until(`document.querySelector('#count')?.textContent.includes('가져온')`);assert.equal(await evaluate(`document.querySelector('#screen-bottom').value`),'1');checks.push('pink-bottom source mapping, matching rendered orientation and saved calibration');
 await evaluate(`(async()=>{const {screenFixture}=await import('/_qa/fixture.js');window.qaSceneCanvas=document.createElement('canvas');window.qaPaint=(options={},layout={})=>{const f=screenFixture(options),tile=document.createElement('canvas');tile.width=f.width;tile.height=f.height;tile.getContext('2d').putImageData(new ImageData(f.data,f.width,f.height),0,0);qaSceneCanvas.width=layout.width??900;qaSceneCanvas.height=layout.height??800;const ctx=qaSceneCanvas.getContext('2d');ctx.fillStyle='#10120e';ctx.fillRect(0,0,qaSceneCanvas.width,qaSceneCanvas.height);ctx.drawImage(tile,layout.x??130,layout.y??80,560*(layout.sx??.8),560*(layout.sy??.85));if(layout.second)ctx.drawImage(tile,650,100,392,392);window.qaSceneStream?.getVideoTracks()[0].requestFrame?.();};qaPaint();Object.defineProperty(navigator.mediaDevices,'getDisplayMedia',{configurable:true,value:async()=>{window.qaSceneStream=qaSceneCanvas.captureStream(30);setTimeout(()=>qaSceneStream.getVideoTracks()[0].requestFrame?.(),100);return qaSceneStream;}});document.querySelector('#screen-open').click();document.querySelector('#screen-connect').click();})()`);
 await until(`document.querySelector('#screen-source-canvas').width===900 && document.querySelectorAll('#screen-review-board circle').length===2`);
 await evaluate(`document.querySelector('#screen-bottom').value='0';document.querySelector('#screen-bottom').dispatchEvent(new Event('change'));document.querySelector('#screen-turn').value='1';document.querySelector('#screen-turn').dispatchEvent(new Event('change'));document.querySelector('#screen-apply').click();document.querySelector('#screen-auto-start').click()`);
 await until(`document.querySelector('#screen-auto-status').textContent.includes('원본과 일치')`);
 await evaluate(`qaPaint({}, {x:176.4,y:80,sx:.8,sy:.85})`);
 await evaluate(`new Promise(r=>setTimeout(r,1800))`);
 assert.equal(await evaluate(`JSON.parse(localStorage.getItem('quoridor-session')).records.length`),0);
 checks.push('whole-board translation by one cell does not fabricate two pawn moves');
 await evaluate(`qaPaint({positions:[{x:4,y:6},{x:4,y:3}]},{x:270,y:140,sx:.65,sy:.7})`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===1`);
 await until(`!!document.querySelector('#board .recommend')`);
 checks.push('automatic calibration tracks a moved and rescaled board inside unchanged video dimensions');
 await evaluate(`qaPaint({positions:[{x:4,y:5},{x:5,y:3}]},{x:170,y:100,sx:.9,sy:.95,width:1000,height:850})`);
 await until(`JSON.parse(localStorage.getItem('quoridor-session')).records.length===3`);
 await until(`!!document.querySelector('#board .recommend')`);
 checks.push('video resolution change automatically reacquires grid and resumes legal synchronization');
 await screenshot('automatic-grid.png');
 await evaluate(`document.querySelector('#screen-open').click();qaPaint({}, {width:1200,height:850,x:30,y:90,sx:.7,sy:.7,second:true});`);
 await until(`document.querySelector('#screen-video').videoWidth===1200`);
 await evaluate(`document.querySelector('#screen-freeze').click()`);
 await until(`document.querySelectorAll('#screen-board-candidates button').length===2`);
 assert.equal(await evaluate(`document.querySelector('#screen-apply').disabled`),true);
 await evaluate(`document.querySelector('#screen-board-candidates button').click();document.querySelector('#screen-apply').click();document.querySelector('#screen-auto-start').click()`);
 await until(`document.querySelector('#screen-auto-status').textContent.includes('원본과 일치')`);
 checks.push('multiple visible boards require selection and tracking retains the selected board');
 await evaluate(`document.querySelector('#screen-open').click();qaSceneCanvas.getContext('2d').fillRect(0,0,1200,850);qaSceneStream.getVideoTracks()[0].requestFrame?.()`);
 await evaluate(`new Promise(r=>setTimeout(r,200))`);await evaluate(`document.querySelector('#screen-freeze').click()`);
 await until(`document.querySelector('#screen-grid-status').textContent.includes('확정하지 못했습니다')`);
 assert.equal(await evaluate(`document.querySelector('#screen-apply').disabled`),true);
 checks.push('missing board blocks application and offers manual calibration instead of guessing');
 assert.deepEqual(errors,[]);await writeFile(path.join(out,'browser-qa.json'),JSON.stringify({browser:'isolated headless Chrome/Edge',checks,uncaughtErrors:errors,realScreenCaptureTested:false,syntheticMediaStreamTested:true,screenshots:['recognition-review.png','applied-board.png','automatic-sync.png','automatic-grid.png']},null,2)+'\n');console.log(JSON.stringify({checks,uncaughtErrors:errors},null,2));
}catch(error){try{await screenshot('failure.png');console.error(await evaluate(`JSON.stringify({message:document.querySelector('#screen-message')?.textContent,calls:window.qaCalls,videoReady:document.querySelector('#screen-video')?.readyState,connection:document.querySelector('#screen-connection')?.textContent,mode:document.querySelector('#mode')?.value})`));}catch{}throw error;}finally{
 if(ws?.readyState===WebSocket.OPEN){try{await send('Browser.close',{},null);}catch{}ws.close();}
 if(chrome&&chrome.exitCode===null){await new Promise(resolve=>{const timer=setTimeout(()=>{chrome.kill();resolve();},3000);chrome.once('exit',()=>{clearTimeout(timer);resolve();});});}
 server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
 // Only remove this freshly allocated profile inside the ignored QA directory.
 if(path.dirname(profile)===temp&&temp.startsWith(path.resolve(root,'native-engine','target')+path.sep))try{await rm(profile,{recursive:true,force:true,maxRetries:10,retryDelay:100});}catch{}
}
