import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,open,unlink,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createNativeService} from '../server/native-service.mjs';
import {nativeSources,digest} from '../evaluation/native-policy.mjs';
import {createPressureService} from '../server/pressure-service.mjs';
import {createAtlas6Service} from '../server/atlas6-service.mjs';
import {watchPressure} from './pressure-hot-reload.mjs';
import {verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {runtimeFingerprint} from './runtime-identity.mjs';
import {leaseOwner,removeUnchangedLease} from './play-lock.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const playPort=12324,playUrl=`http://127.0.0.1:${playPort}`;
const args=process.argv.slice(2),folder=path.resolve(args.includes('--state-dir')?args[args.indexOf('--state-dir')+1]:'.local-app');
const lock=path.join(folder,'running.json');await mkdir(folder,{recursive:true});
async function request(state,stop=false){return fetch(`${state.url}/__app/${stop?'stop':'health'}`,{method:stop?'POST':'GET',headers:{Authorization:`Bearer ${state.token}`},signal:AbortSignal.timeout(1500)});}
function browser(url){if(args.includes('--no-open'))return;const child=spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{windowsHide:true,stdio:'ignore'});child.on('error',e=>console.error(e.message));child.unref();}
async function existing(){try{return JSON.parse(await readFile(lock,'utf8'));}catch{return null;}}
if(args.includes('--stop')) {
 const state=await existing();if(!state){console.log('실행 중인 쿼리도 앱이 없습니다.');process.exit(0);}
 try{const r=await request(state,true);if(!r.ok)throw Error('종료 요청이 거절됐습니다.');console.log('쿼리도 앱을 종료했습니다.');}
 catch(e){console.error(`앱 종료 실패: ${e.message}`);process.exitCode=1;}
}else {
 let acquired=false,waiting=false;const waitUntil=Date.now()+120000;
 const lease={pid:process.pid,phase:'starting',processStartedAt:Math.round(Date.now()-process.uptime()*1000),createdAt:Date.now()};
 let inspected=null,inspectedAt=0,owner='unknown';
 while(Date.now()<waitUntil) {
  try{const f=await open(lock,'wx');await f.writeFile(JSON.stringify(lease));await f.close();acquired=true;break;}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const state=await existing();
  if(!state){try{if(Date.now()-(await stat(lock)).mtimeMs>30000){await unlink(lock);continue;}}catch{}}
  if(state?.url){try{const r=await request(state),health=r.ok?await r.json():null;if(health?.service==='quoridor-play-v1'){
   const current=await runtimeFingerprint(root);
   if(!args.includes('--restart')&&state.url===playUrl&&health.fingerprint===current){browser(playUrl);console.log(`최신 쿼리도 화면을 열었습니다: ${playUrl}`);process.exit(0);}
   console.log('이전 실행을 종료하고 변경된 앱·엔진을 준비합니다. 기보는 브라우저에 유지됩니다.');
   const stopped=await request(state,true);if(!stopped.ok)throw Error('기존 앱 종료 실패');
   const until=Date.now()+10000;while(Date.now()<until){const latest=await existing();if(!latest||latest.pid!==state.pid)break;await new Promise(r=>setTimeout(r,100));}
   continue;
  }}catch(error){if(error.message==='기존 앱 종료 실패')throw error;}}
  if(state?.pid){const signature=JSON.stringify(state);if(signature!==inspected||Date.now()-inspectedAt>1500){owner=await leaseOwner(state,{root});inspected=signature;inspectedAt=Date.now();}
   if(owner==='dead'||owner==='mismatch'){if(await removeUnchangedLease(lock,state))console.log('종료된 실행의 잠금을 자동 정리했습니다.');continue;}}
  if(!waiting){console.log('다른 실행이 준비 중입니다. 준비가 끝나면 기존 화면으로 연결합니다.');waiting=true;}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!acquired){console.error('쿼리도 실행 준비를 2분 동안 확인하지 못했습니다. 기존 실행의 준비 로그와 포트 12324 상태를 확인해 주세요.');process.exit(1);}
 let native=null,goal=null,atlas6=null,web=null,watcher=null,stopping=null;const token=randomUUID();
 const cleanup=()=>stopping??=(async()=>{
  watcher?.close();
  if(web){web.closeAllConnections();await new Promise(r=>web.close(r));}
  if(native)await native.close();
  if(goal)await goal.close();
  if(atlas6)await atlas6.close();
  const state=await existing();if(state?.pid===process.pid)await unlink(lock).catch(()=>{});
 })();
 process.on('SIGINT',()=>cleanup().then(()=>process.exit()));process.on('SIGTERM',()=>cleanup().then(()=>process.exit()));
 try {
  // Reserve the public address before expensive builds. Never silently move
  // to another port or terminate an unrelated process occupying this one.
  web=http.createServer((req,res)=>{res.writeHead(503,{'Retry-After':'2'});res.end('Quoridor is starting. Please refresh shortly.');});
  await new Promise((resolve,reject)=>{web.once('error',reject);web.listen(playPort,'127.0.0.1',resolve);});
  const run=(file,parameters=[])=>{const r=spawnSync(process.execPath,[file,...parameters],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error(`준비 실패: ${file}`);};
  // Build the browser bundle, not a development server. Reuse a native build
  // only when its full source manifest still matches this checkout.
  let ready=false;try{const manifest=JSON.parse(await readFile('native-engine/target/release/source-manifest.json'));
   ready=(await Promise.all(nativeSources.map(async f=>manifest.sources[f]===digest(await readFile(f))))).every(Boolean);
   await stat(`native-engine/target/release/quoridor-native${process.platform==='win32'?'.exe':''}`);
  }catch{}
  if(!ready)run('scripts/build-native.mjs');
  native=createNativeService();await native.client.health();
  await new Promise((resolve,reject)=>{native.server.once('error',reject);native.server.listen(0,'127.0.0.1',resolve);});
  try{verifyPressureBuild();}catch{run('scripts/build-pressure.mjs');}
  try{goal=createPressureService({goal:true});await goal.client.health();await new Promise((resolve,reject)=>{goal.server.once('error',reject);goal.server.listen(0,'127.0.0.1',resolve);});}catch(error){console.error(`골인 안전 실험 엔진 준비 실패: ${error.message}`);if(goal)await goal.close();goal=null;}
  // Keep the public server alive while a new goal engine builds in isolation.
  // Never interrupt an active native search; new requests switch after it drains.
  watcher=watchPressure({root,folder,getCurrent:()=>goal,
   replace:async(next,isClosed)=>{
    while(!isClosed()&&goal?.client.pending.size>0)await new Promise(r=>setTimeout(r,100));
    if(isClosed())return;
    const previous=goal;goal=next;
    if(previous)await previous.close();
   },
   onStatus:(status,error)=>console.log('[goal hot reload]',status,error?.message??'')
  });
  run('scripts/build-atlas6.mjs');
  atlas6=createAtlas6Service();await atlas6.client.health();
  await new Promise((resolve,reject)=>{atlas6.server.once('error',reject);atlas6.server.listen(0,'127.0.0.1',resolve);});
  // Compile the browser contract after its engine build has been verified.
  if(!args.includes('--no-build'))run('node_modules/vite/bin/vite.js',['build']);
  const fingerprint=await runtimeFingerprint(root);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
  const dist=path.join(root,'dist');
  web.removeAllListeners('request');
  web.on('request',async(req,res)=>{
   if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host??'')){res.writeHead(403).end();return;}
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname.startsWith('/__app/')) {
    if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(403).end();return;}
    if(pathname==='/__app/health'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'quoridor-play-v1',fingerprint}));return;}
    if(pathname==='/__app/stop'&&req.method==='POST'){res.end('ok');setTimeout(()=>cleanup().then(()=>process.exit()),50);return;}
    res.writeHead(404).end();return;
   }
   if(pathname.startsWith('/api/native/')||pathname.startsWith('/api/goal/')||pathname.startsWith('/api/atlas6/')) {
    const selected=pathname.startsWith('/api/atlas6/')?atlas6:pathname.startsWith('/api/goal/')?goal:native;
    if(!selected){res.writeHead(503).end('Experimental engine unavailable');return;}
    const upstream=http.request({host:'127.0.0.1',port:selected.server.address().port,path:req.url.replace(/^\/api\/(native|goal|atlas6)/,''),method:req.method,headers:{...req.headers,host:`127.0.0.1:${selected.server.address().port}`}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
   try{
    const file=path.resolve(dist,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:bytes);
   }catch{res.writeHead(404).end();}
  });
  const state={...lease,phase:'ready',url:playUrl,token};
  const health=await request(state);const page=await fetch(playUrl,{signal:AbortSignal.timeout(2000)});
  if(!health.ok||(await health.json()).fingerprint!==fingerprint||!page.ok)throw Error('고정 주소의 최신 앱 응답을 확인하지 못했습니다.');
  await writeFile(lock,JSON.stringify(state));console.log(`쿼리도 준비 완료: ${playUrl}`);browser(playUrl);
 }catch(e){await cleanup();console.error(e.code==='EADDRINUSE'?`포트 ${playPort}를 다른 프로그램이 사용하고 있습니다. 해당 프로그램을 종료한 뒤 쿼리도를 다시 실행하세요. 접속 주소는 ${playUrl}/로 유지됩니다.`:e.stack);process.exitCode=1;}
}
