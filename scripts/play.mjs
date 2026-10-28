import http from 'node:http';
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir,open,unlink,stat} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {createNativeService} from '../server/native-service.mjs';
import {nativeSources,digest} from '../evaluation/native-policy.mjs';

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
 let acquired=false;
 for(let attempt=0;attempt<50;attempt++) {
  try{const f=await open(lock,'wx');await f.writeFile(JSON.stringify({pid:process.pid}));await f.close();acquired=true;break;}
  catch(e){if(e.code!=='EEXIST')throw e;}
  const state=await existing();
  if(!state){try{if(Date.now()-(await stat(lock)).mtimeMs>30000){await unlink(lock);continue;}}catch{}}
  if(state?.url){try{const r=await request(state);if(r.ok&&(await r.json()).service==='quoridor-play-v1'){browser(state.url);console.log('실행 중인 쿼리도 화면을 열었습니다.');process.exit(0);}}catch{}}
  if(state?.pid){let alive=true;try{process.kill(state.pid,0);}catch(e){if(e.code==='ESRCH')alive=false;}
   if(!alive){await unlink(lock).catch(()=>{});continue;}}
  await new Promise(r=>setTimeout(r,200));
 }
 if(!acquired)throw Error('다른 실행이 준비 중입니다. 잠시 후 다시 실행해 주세요.');
 let native=null,web=null,stopping=null;const token=randomUUID();
 const cleanup=()=>stopping??=(async()=>{
  if(web){web.closeAllConnections();await new Promise(r=>web.close(r));}
  if(native)await native.close();
  const state=await existing();if(state?.pid===process.pid)await unlink(lock).catch(()=>{});
 })();
 process.on('SIGINT',()=>cleanup().then(()=>process.exit()));process.on('SIGTERM',()=>cleanup().then(()=>process.exit()));
 try {
  const run=(file,parameters=[])=>{const r=spawnSync(process.execPath,[file,...parameters],{stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error(`준비 실패: ${file}`);};
  // Build the browser bundle, not a development server. Reuse a native build
  // only when its full source manifest still matches this checkout.
  if(!args.includes('--no-build'))run('node_modules/vite/bin/vite.js',['build']);
  let ready=false;try{const manifest=JSON.parse(await readFile('native-engine/target/release/source-manifest.json'));
   ready=(await Promise.all(nativeSources.map(async f=>manifest.sources[f]===digest(await readFile(f))))).every(Boolean);
   await stat(`native-engine/target/release/quoridor-native${process.platform==='win32'?'.exe':''}`);
  }catch{}
  if(!ready)run('scripts/build-native.mjs');
  native=createNativeService();await native.client.health();
  await new Promise((resolve,reject)=>{native.server.once('error',reject);native.server.listen(0,'127.0.0.1',resolve);});
  const types={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.wasm':'application/wasm','.svg':'image/svg+xml','.png':'image/png','.ico':'image/x-icon'};
  const dist=path.join(root,'dist');
  web=http.createServer(async(req,res)=>{
   if(!/^127\.0\.0\.1:\d+$/.test(req.headers.host??'')){res.writeHead(403).end();return;}
   const pathname=new URL(req.url,'http://localhost').pathname;
   if(pathname.startsWith('/__app/')) {
    if(req.headers.authorization!==`Bearer ${token}`){res.writeHead(403).end();return;}
    if(pathname==='/__app/health'&&req.method==='GET'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({service:'quoridor-play-v1'}));return;}
    if(pathname==='/__app/stop'&&req.method==='POST'){res.end('ok');setTimeout(()=>cleanup().then(()=>process.exit()),50);return;}
    res.writeHead(404).end();return;
   }
   if(pathname.startsWith('/api/native/')) {
    const upstream=http.request({host:'127.0.0.1',port:native.server.address().port,path:req.url.replace(/^\/api\/native/,''),method:req.method,headers:{...req.headers,host:`127.0.0.1:${native.server.address().port}`}},reply=>{res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);});
    upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503);res.end();});res.on('close',()=>upstream.destroy());req.pipe(upstream);return;
   }
   if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
   try{
    const file=path.resolve(dist,'.'+decodeURIComponent(pathname==='/'?'/index.html':pathname));
    if(!file.startsWith(dist+path.sep)){res.writeHead(403).end();return;}
    const bytes=await readFile(file);res.setHeader('Content-Type',types[path.extname(file)]??'application/octet-stream');res.setHeader('Cache-Control','no-store');res.end(req.method==='HEAD'?undefined:bytes);
   }catch{res.writeHead(404).end();}
  });
  await new Promise((resolve,reject)=>{web.once('error',reject);web.listen(0,'127.0.0.1',resolve);});
  const url=`http://127.0.0.1:${web.address().port}`;
  await writeFile(lock,JSON.stringify({pid:process.pid,url,token}));console.log(`쿼리도 준비 완료: ${url}`);browser(url);
 }catch(e){await cleanup();console.error(e.stack);process.exitCode=1;}
}
