import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,open,unlink,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createNativeService} from '../server/native-service.mjs';
import {nativeSources,digest} from '../evaluation/native-policy.mjs';
import {createExperimentalService} from '../server/experimental-service.mjs';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {createPressureService} from '../server/pressure-service.mjs';
import {verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {runtimeFingerprint} from './runtime-identity.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
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
 let acquired=false,preferredPort=0;
 for(let attempt=0;attempt<50;attempt++) {
  try{const f=await open(lock,'wx');await f.writeFile(JSON.stringify({pid:process.pid}));await f.close();acquired=true;break;}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const state=await existing();
  if(!state){try{if(Date.now()-(await stat(lock)).mtimeMs>30000){await unlink(lock);continue;}}catch{}}
  if(state?.url){try{const r=await request(state),health=r.ok?await r.json():null;if(health?.service==='quoridor-play-v1'){
   const current=await runtimeFingerprint(root);
   if(!args.includes('--restart')&&health.fingerprint===current){browser(state.url);console.log('최신 쿼리도 화면을 열었습니다.');process.exit(0);}
   console.log('이전 실행을 종료하고 변경된 앱·엔진을 준비합니다. 기보는 브라우저에 유지됩니다.');
   const previousUrl=new URL(state.url);if(previousUrl.hostname==='127.0.0.1')preferredPort=Number(previousUrl.port);
   const stopped=await request(state,true);if(!stopped.ok)throw Error('기존 앱 종료 실패');
   const until=Date.now()+10000;while(Date.now()<until){const latest=await existing();if(!latest||latest.pid!==state.pid)break;await new Promise(r=>setTimeout(r,100));}
   continue;
  }}catch(error){if(error.message==='기존 앱 종료 실패')throw error;}}
  if(state?.pid){let alive=true;try{process.kill(state.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
   if(!alive){await unlink(lock).catch(()=>{});continue;}}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!acquired)throw Error('다른 실행이 준비 중입니다. 잠시 후 다시 실행해 주세요.');
 let native=null,experimental=null,pressure=null,tempo=null,web=null,stopping=null;const token=randomUUID();
 const cleanup=()=>stopping??=(async()=>{
  if(web){web.closeAllConnections();await new Promise(r=>web.close(r));}
  if(native)await native.close();
  if(experimental)await experimental.close();
  if(pressure)await pressure.close();
  if(tempo)await tempo.close();
  const state=await existing();if(state?.pid===process.pid)await unlink(lock).catch(()=>{});
 })();
 process.on('SIGINT',()=>cleanup().then(()=>process.exit()));process.on('SIGTERM',()=>cleanup().then(()=>process.exit()));
 try {
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
  try{try{verifyMazeBuild();}catch{run('scripts/build-maze.mjs');}
   experimental=createExperimentalService();await experimental.client.health();
   await new Promise((resolve,reject)=>{experimental.server.once('error',reject);experimental.server.listen(0,'127.0.0.1',resolve);});
  }catch(error){console.error(`실험 엔진 준비 실패: ${error.message}`);if(experimental)await experimental.close();experimental=null;}
  try{try{verifyPressureBuild();}catch{run('scripts/build-pressure.mjs');}pressure=createPressureService();await pressure.client.health();await new Promise((resolve,reject)=>{pressure.server.once('error',reject);pressure.server.listen(0,'127.0.0.1',resolve);});}catch(error){console.error(`즉시 압박 엔진 준비 실패: ${error.message}`);if(pressure)await pressure.close();pressure=null;}
  try{tempo=createPressureService({tempo:true});await tempo.client.health();await new Promise((resolve,reject)=>{tempo.server.once('error',reject);tempo.server.listen(0,'127.0.0.1',resolve);});}catch(error){console.error(`벽 투자 실험 엔진 준비 실패: ${error.message}`);if(tempo)await tempo.close();tempo=null;}
  // Compile the browser contract after its engine build has been verified.
  if(!args.includes('--no-build'))run('node_modules/vite/bin/vite.js',['build']);
  const fingerprint=await runtimeFingerprint(root);
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
  const dist=path.join(root,'dist');
  web=http.createServer(async(req,res)=>{
   if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host??'')){res.writeHead(403).end();return;}
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname.startsWith('/__app/')) {
    if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(403).end();return;}
    if(pathname==='/__app/health'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'quoridor-play-v1',fingerprint}));return;}
    if(pathname==='/__app/stop'&&req.method==='POST'){res.end('ok');setTimeout(()=>cleanup().then(()=>process.exit()),50);return;}
    res.writeHead(404).end();return;
   }
   if(pathname.startsWith('/api/native/')||pathname.startsWith('/api/experimental/')||pathname.startsWith('/api/pressure/')||pathname.startsWith('/api/tempo/')) {
    const selected=pathname.startsWith('/api/tempo/')?tempo:pathname.startsWith('/api/pressure/')?pressure:pathname.startsWith('/api/experimental/')?experimental:native;
    if(!selected){res.writeHead(503).end('Experimental engine unavailable');return;}
    const upstream=http.request({host:'127.0.0.1',port:selected.server.address().port,path:req.url.replace(/^\/api\/(native|experimental|pressure|tempo)/,''),method:req.method,headers:{...req.headers,host:`127.0.0.1:${selected.server.address().port}`}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
   try{
    const file=path.resolve(dist,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:bytes);
   }catch{res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{web.once('error',reject);web.listen(preferredPort,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${web.address().port}`;
  await writeFile(lock,JSON.stringify({pid:process.pid,url,token}));console.log(`쿼리도 준비 완료: ${url}`);browser(url);
 }catch(e){await cleanup();console.error(e.stack);process.exitCode=1;}
}
