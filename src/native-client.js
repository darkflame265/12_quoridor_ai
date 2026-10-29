const pageSession=globalThis.crypto?.randomUUID?.()??`page-${Date.now()}-${Math.random()}`;
const abortError=()=>Object.assign(Error('Calculation cancelled'),{name:'AbortError'});
export class NativeClient{
 constructor({fetcher=(...args)=>fetch(...args),onStatus=()=>{},base='/api/native',expectedPressureBuild=typeof __PRESSURE_BUILD__==='undefined'?null:__PRESSURE_BUILD__}={}){this.expectedPressureBuild=expectedPressureBuild;this.base=base;this.fetcher=fetcher;this.onStatus=onStatus;this.online=false;this.checked=0;this.probing=null;this.job=null;this.disposed=false;this.probe().catch(()=>{});}
 async probe(){if(this.disposed)return false;if(this.probing)return this.probing;if(Date.now()-this.checked<(this.online?10000:1000))return this.online;
  this.probing=(async()=>{this.unavailableReason=null;try{const r=await this.fetcher(this.base+'/health',{signal:AbortSignal.timeout(150),cache:'no-store'});const info=r.ok?await r.json():null;this.info=info;const expected={'/api/experimental':'atlas-experiment','/api/pressure':'atlas-pressure','/api/tempo':'atlas-tempo','/api/goal':'atlas-goal'}[this.base];this.online=info?.service==='quoridor-native-v1'&&(!expected||info.engineInfo?.id===expected);
   if(this.online&&['/api/pressure','/api/tempo','/api/goal'].includes(this.base)&&(!info.engineInfo.version?.startsWith(this.base==='/api/goal'?'0.4 ':this.base==='/api/tempo'?'0.3 ':'0.2 ')||this.expectedPressureBuild&&info.engineInfo.build!==this.expectedPressureBuild)){this.online=false;this.unavailableReason='실제 엔진 버전·빌드가 현재 앱과 다릅니다. 쿼리도 실행기를 다시 열어 갱신하세요.';}
  }catch{this.online=false;}this.checked=Date.now();if(!this.disposed)this.onStatus(this.unavailableReason?'stale':this.online?'native':'wasm',this.info);this.probing=null;return this.online;})();return this.probing;
 }
 async search(state,{ms,cores,onProgress=()=>{}}){if(['/api/pressure','/api/tempo','/api/goal'].includes(this.base)&&!await this.probe())throw Error(this.unavailableReason??'실제 엔진 확인 실패. 실행기를 다시 열어 주세요.');if(this.unavailableReason)throw Error(this.unavailableReason);this.cancel();const id=globalThis.crypto.randomUUID(),controller=new AbortController(),job={id,controller};this.job=job;
  try{const response=await this.fetcher(this.base+'/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,session:pageSession,state,ms:Math.max(1,ms),cores,...(['/api/pressure','/api/tempo','/api/goal'].includes(this.base)&&this.expectedPressureBuild?{expectedBuild:this.expectedPressureBuild}:{})}),signal:controller.signal});if(!response.ok)throw Error(`Native engine unavailable (${response.status})`);
   const reader=response.body.getReader(),decoder=new TextDecoder();let buffer='',result;
   const accept=line=>{if(!line.trim())return;const r=JSON.parse(line);if(this.job!==job||r.id!==id)return;if(r.error)throw Error(r.error);if(r.done)result=r;else onProgress(r);};
   while(true){const {value,done}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+1);accept(line);}}
   buffer+=decoder.decode();if(buffer)accept(buffer);if(this.job!==job)throw abortError();if(!result)throw Error('Native engine returned no result');return result;
  }finally{if(this.job===job)this.job=null;}
 }
 cancel(){const job=this.job;if(!job)return;this.job=null;job.controller.abort();this.fetcher(this.base+'/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:job.id}),keepalive:true}).catch(()=>{});}
 dispose(){this.disposed=true;this.cancel();}
}
