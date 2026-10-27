const pageSession=globalThis.crypto?.randomUUID?.()??`page-${Date.now()}-${Math.random()}`;
const abortError=()=>Object.assign(Error('Calculation cancelled'),{name:'AbortError'});
export class NativeClient{
 constructor({fetcher=(...args)=>fetch(...args),onStatus=()=>{}}={}){this.fetcher=fetcher;this.onStatus=onStatus;this.online=false;this.checked=0;this.probing=null;this.job=null;this.disposed=false;this.probe().catch(()=>{});}
 async probe(){if(this.disposed)return false;if(this.probing)return this.probing;if(Date.now()-this.checked<(this.online?10000:1000))return this.online;
  this.probing=(async()=>{try{const r=await this.fetcher('/api/native/health',{signal:AbortSignal.timeout(150),cache:'no-store'});this.online=r.ok&&(await r.json()).service==='quoridor-native-v1';}catch{this.online=false;}this.checked=Date.now();if(!this.disposed)this.onStatus(this.online?'native':'wasm');this.probing=null;return this.online;})();return this.probing;
 }
 async search(state,{ms,cores,onProgress=()=>{}}){this.cancel();const id=globalThis.crypto.randomUUID(),controller=new AbortController(),job={id,controller};this.job=job;
  try{const response=await this.fetcher('/api/native/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,session:pageSession,state,ms:Math.max(1,ms),cores}),signal:controller.signal});if(!response.ok)throw Error(`Native engine unavailable (${response.status})`);
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
   const accept=line=>{if(!line.trim())return;const r=JSON.parse(line);if(this.job!==job||r.id!==id)return;if(r.error)throw Error(r.error);if(r.done)result=r;else onProgress(r);};
   while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);accept(line);}}
   buffer+=decoder.decode();if(buffer)accept(buffer);if(this.job!==job)throw abortError();if(!result)throw Error('Native engine returned no result');return result;
  }finally{if(this.job===job)this.job=null;}
 }
 cancel(){const job=this.job;if(!job)return;this.job=null;job.controller.abort();this.fetcher('/api/native/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id}),keepalive:true}).catch(()=>{});}
 dispose(){this.disposed=true;this.cancel();}
}
