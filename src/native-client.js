const pageSession=globalThis.crypto?.randomUUID?.()??`page-${Date.now()}-${Math.random()}`;
const abortError=()=>Object.assign(Error('Calculation cancelled'),{name:'AbortError'});
export class NativeClient{
 constructor({fetcher=(...args)=>fetch(...args),onStatus=()=>{},base='/api/sigma4',autoProbe=true}={}){
  if(!['/api/sigma2','/api/sigma3','/api/sigma4'].includes(base))throw Error('Unsupported engine endpoint');
  this.base=base;this.fetcher=fetcher;this.onStatus=onStatus;this.online=false;this.checked=0;this.probing=null;this.job=null;this.disposed=false;if(autoProbe)this.probe().catch(()=>{});
 }
 async probe(){
  if(this.disposed)return false;if(this.probing)return this.probing;if(Date.now()-this.checked<(this.online?10000:1000))return this.online;
  this.probing=(async()=>{
   try{const r=await this.fetcher(this.base+'/health',{signal:AbortSignal.timeout(2000),cache:'no-store'});this.info=r.ok?await r.json():null;this.online=this.info?.service==='quoridor-native-v1'&&this.info.engineInfo?.id===this.base.slice(5);}
   catch{this.online=false;}
   this.checked=Date.now();if(!this.disposed)this.onStatus(this.online?'native':'unavailable',this.info);this.probing=null;return this.online;
  })();return this.probing;
 }
 async search(state,{ms=500,cores=1,wallStreak=0,defenseReply=null,onProgress=()=>{}}={}){
  if(!await this.probe())throw Error('Sigma engine unavailable; restart the app');
  this.cancel();const id=globalThis.crypto.randomUUID(),controller=new AbortController(),job={id,controller};this.job=job;
  try{
   const response=await this.fetcher(this.base+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,session:pageSession,state:{...state,defenseReply,wallStreak:Number.isInteger(wallStreak)?Math.max(0,Math.min(10,wallStreak)):0},ms:Math.max(1,ms),cores}),signal:controller.signal});
   if(!response.ok)throw Error(`Sigma engine unavailable (${response.status})`);
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
   const accept=line=>{if(!line.trim())return;const r=JSON.parse(line);if(this.job!==job||r.id!==id)return;if(r.error)throw Error(r.error);if(r.done)result=r;else onProgress(r);};
   while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);accept(line);}}
   buffer+=decoder.decode();if(buffer)accept(buffer);if(this.job!==job)throw abortError();if(!result)throw Error('Sigma engine returned no result');return result;
  }finally{if(this.job===job)this.job=null;}
 }
 cancel(){const job=this.job;if(!job)return;this.job=null;job.controller.abort();this.fetcher(this.base+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id}),keepalive:true}).catch(()=>{});}
 dispose(){this.disposed=true;this.cancel();}
}
