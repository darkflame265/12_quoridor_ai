let runtime=null,sequence=0;const pending=new Map();let users=0;
const abortError=()=>Object.assign(Error('Calculation cancelled'),{name:'AbortError'});
function worker(){
 if(runtime)return runtime;
 runtime=new Worker(new URL('./browser-engine-worker.js',import.meta.url),{type:'module'});
 runtime.onmessage=({data})=>{const job=pending.get(data.id);if(!job)return;clearTimeout(job.timer);pending.delete(data.id);data.error?job.reject(Error(data.error)):job.resolve(data);};
 runtime.onerror=()=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('브라우저 AI 실행 실패. 페이지를 새로고침해 주세요.'));}pending.clear();runtime?.terminate();runtime=null;};
 return runtime;
}
function request(payload){const id=++sequence;return {id,promise:new Promise((resolve,reject)=>{
 const timer=setTimeout(()=>{pending.delete(id);runtime?.postMessage({type:'cancel',id});reject(Error('브라우저 AI 준비 시간이 초과되었습니다. 새로고침 후 다시 시도하세요.'));},60000);
 pending.set(id,{resolve,reject,timer});try{worker().postMessage({...payload,id});}catch(e){clearTimeout(timer);pending.delete(id);reject(e);}
})};}
export class BrowserClient{
 constructor({engine='sigma4',onStatus=()=>{}}={}){this.engine=engine;this.onStatus=onStatus;this.online=false;this.disposed=false;this.job=null;this.probing=null;users++;this.info={service:'quoridor-browser-v1',engineInfo:{id:engine,version:'web-1',build:'browser-web-1'},backend:'browser-wasm'};}
 async probe(){
  if(this.disposed)return false;if(this.online)return true;if(this.probing)return this.probing;
  this.onStatus('loading',this.info);
  this.probing=request({type:'probe'}).promise.then(()=>{if(this.disposed)return false;this.online=true;this.onStatus('browser',this.info);return true;}).catch(e=>{if(!this.disposed)this.onStatus('unavailable',this.info);throw e;}).finally(()=>{this.probing=null;});return this.probing;
 }
 async search(state,{ms=500}={}){
  await this.probe();if(this.disposed)throw abortError();this.cancel();
  const job=request({type:'search',state,options:{engine:this.engine,ms}});this.job=job;
  try{const data=await job.promise;if(this.disposed||this.job!==job)throw abortError();return data.result;}
  finally{if(this.job===job)this.job=null;}
 }
 cancel(){const job=this.job;this.job=null;if(!job)return;runtime?.postMessage({type:'cancel',id:job.id});const p=pending.get(job.id);if(p){clearTimeout(p.timer);p.reject(abortError());}pending.delete(job.id);}
 dispose(){if(this.disposed)return;this.disposed=true;this.cancel();if(--users===0){runtime?.terminate();runtime=null;for(const j of pending.values()){clearTimeout(j.timer);j.reject(abortError());}pending.clear();}}
}
