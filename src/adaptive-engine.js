import {NativeClient} from './native-client.js';
import {supportedEngines} from './session-settings.js';
export class AdaptiveEngine{
 constructor({workers=4,engine='sigma4',onStatus=()=>{},nativeClient,autoProbe=true}={}){
  if(!supportedEngines.includes(engine))throw Error('Unknown engine');
  this.engine=engine;this.size=Math.max(1,Math.min(4,workers|0));this.onStatus=onStatus;this.generation=0;this.job=null;
  this.native=nativeClient??new NativeClient({base:'/api/'+engine,onStatus,autoProbe});
 }
 get active(){return this.job!==null;}
 get ponderMs(){return 1500;}
 cancel(){this.generation++;this.job=null;this.native.cancel();}
 dispose(){this.cancel();this.native.dispose();}
 async search(state,{ms=500,onProgress=()=>{},cores=this.size,wallStreak=0,defenseReply=null}={}){
  this.cancel();const generation=this.generation,start=performance.now();this.job={generation};
  const check=()=>{if(generation!==this.generation)throw Object.assign(Error('Calculation cancelled'),{name:'AbortError'});};
  try{
   if(!this.native.online&&!await this.native.probe()){check();this.onStatus('unavailable',this.native.info);throw Error('선택한 Sigma 엔진을 사용할 수 없습니다. 앱을 다시 실행해 주세요.');}
   check();const r=await this.native.search(state,{ms:Math.max(1,ms-(performance.now()-start)),cores:Math.max(1,Math.min(this.size,cores)),wallStreak,defenseReply,onProgress:r=>{if(generation===this.generation)onProgress(r);}});check();return {...r,elapsedMs:performance.now()-start};
  }finally{if(generation===this.generation)this.job=null;}
 }
}
