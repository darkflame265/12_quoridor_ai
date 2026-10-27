import http from 'node:http';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {NativeProcess} from './native-process.mjs';
import {activeNativeProfile} from '../evaluation/native-policy.mjs';
function validState(s){return s&&Array.isArray(s.p)&&s.p.length===2&&s.p.every(p=>p&&Number.isInteger(p.x)&&Number.isInteger(p.y)&&p.x>=0&&p.x<9&&p.y>=0&&p.y<9)&&Array.isArray(s.left)&&s.left.length===2&&s.left.every(n=>Number.isInteger(n)&&n>=0&&n<=10)&&[0,1].includes(s.turn)&&[null,0,1].includes(s.winner)&&Array.isArray(s.walls)&&s.walls.length<=20&&s.walls.every(w=>w&&['h','v'].includes(w.o)&&Number.isInteger(w.x)&&Number.isInteger(w.y)&&w.x>=0&&w.x<8&&w.y>=0&&w.y<8);}
export function createNativeService({client=new NativeProcess({profile:activeNativeProfile()})}={}){
 let active=null;const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin,host=req.headers.host??'';
  if(!/^(127\.0\.0\.1|localhost):\d+$/.test(host)||origin&&!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)){res.writeHead(403);res.end('Local origin required');return;}
  const reply=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(value));};
  try{
   if(req.method==='GET'&&req.url==='/health'){reply(200,{...await client.health(),service:'quoridor-native-v1',profile:client.profile,gpuInferenceActive:false});return;}
   if(req.method!=='POST'||!['/search','/cancel'].includes(req.url)){reply(404,{error:'Unknown endpoint'});return;}
   let body='';for await(const chunk of req){body+=chunk;if(Buffer.byteLength(body)>65536){reply(413,{error:'Request too large'});return;}}
   let data;try{data=JSON.parse(body);}catch{reply(400,{error:'Invalid JSON'});return;}
   if(typeof data.id!=='string'||data.id.length<1||data.id.length>128){reply(400,{error:'Invalid request id'});return;}
   if(req.url==='/cancel'){if(active?.id===data.id){client.cancel(data.id);active=null;}reply(200,{cancelled:true});return;}
   if(!validState(data.state)||!Number.isFinite(data.ms)||data.ms<1||data.ms>30000||!Number.isInteger(data.cores)||data.cores<1||data.cores>4||typeof data.session!=='string'||data.session.length>128){reply(400,{error:'Invalid search request'});return;}
   if(active){if(active.session!==data.session){reply(409,{error:'Native engine busy'});return;}client.cancel(active.id);}
   const task={id:data.id,session:data.session};active=task;
   res.writeHead(200,{'Content-Type':'application/x-ndjson','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
   const send=r=>{if(!res.destroyed)res.write(JSON.stringify(r)+'\n');};
   res.on('close',()=>{if(active===task){active=null;client.cancel(task.id);}});
   try{const result=await client.search(data.state,{id:data.id,ms:data.ms,cores:data.cores,onProgress:send});send({...result,done:true});}
   catch(error){send({id:data.id,done:true,error:error.message,cancelled:error.name==='AbortError'});}
   finally{if(active===task)active=null;res.end();}
  }catch(error){if(!res.headersSent)reply(503,{error:error.message});else res.end();}
 });
 return {server,client,async close(){client.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const service=createNativeService(),port=Number(process.env.QUORIDOR_NATIVE_PORT??4317);await service.client.health();service.server.listen(port,'127.0.0.1',()=>console.log(`Atlas native service: http://127.0.0.1:${service.server.address().port}`));
 const stop=()=>{service.close().finally(()=>process.exit());};process.on('SIGINT',stop);process.on('SIGTERM',stop);
 process.on('message',message=>{if(message?.op==='shutdown')stop();});process.on('disconnect',stop);
}
