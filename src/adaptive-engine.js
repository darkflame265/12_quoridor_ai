import {EnginePool} from './engine-pool.js';
import {NativeClient} from './native-client.js';
export class AdaptiveEngine{
 constructor({workers=4,engine='atlas5',onStatus=()=>{},nativeClient,webPool}={}){if(!['atlas5','atlas-experiment','atlas-pressure','atlas-tempo','atlas4','atlas3'].includes(engine))throw Error('Unknown engine');this.engine=engine;this.web=webPool??new EnginePool({workers,engine:engine==='atlas3'?'atlas3':'atlas4'});this.onStatus=onStatus;this.native=['atlas5','atlas-experiment','atlas-pressure','atlas-tempo'].includes(engine)?(nativeClient??new NativeClient({onStatus:(status,info)=>onStatus(['atlas-experiment','atlas-pressure','atlas-tempo'].includes(engine)&&status==='wasm'?'unavailable':status,info),base:engine==='atlas-tempo'?'/api/tempo':engine==='atlas-pressure'?'/api/pressure':engine==='atlas-experiment'?'/api/experimental':'/api/native'})):null;this.size=this.web.size;this.generation=0;this.job=null;}
 get active(){return this.job!==null;}
 get ponderMs(){return this.native?.online?1500:250;}
 cancel(){this.generation++;this.job=null;this.native?.cancel();this.web.cancel();}
 dispose(){this.cancel();this.native?.dispose();this.web.dispose();}
 async search(state,{ms=500,onProgress=()=>{},ponder=false}={}){this.cancel();const generation=this.generation,start=performance.now();this.job={generation};const guarded=r=>{if(generation===this.generation)onProgress(r);};
  try{if(this.native&&(this.native.online||await this.native.probe())){
    if(generation!==this.generation)throw Object.assign(Error('Calculation cancelled'),{name:'AbortError'});
    try{const r=await this.native.search(state,{ms:Math.max(1,ms-(performance.now()-start)),cores:this.size,onProgress:guarded});if(generation!==this.generation)throw Object.assign(Error('Calculation cancelled'),{name:'AbortError'});return {...r,elapsedMs:performance.now()-start};}
    catch(error){if(generation!==this.generation)throw error;this.native.online=false;this.native.checked=Date.now();}
   }
   if(generation!==this.generation)throw Object.assign(Error('Calculation cancelled'),{name:'AbortError'});
   if(['atlas-experiment','atlas-pressure','atlas-tempo'].includes(this.engine)){this.onStatus(this.native?.unavailableReason?'stale':'unavailable',this.native?.info);throw Error(this.native?.unavailableReason??'실험 엔진을 사용할 수 없습니다. 실행기를 다시 시작하거나 안정 엔진을 선택하세요.');}
   this.onStatus(this.engine==='atlas3'?'atlas3':this.engine==='atlas4'?'atlas4':'wasm');
   const r=await this.web.search(state,{ms:Math.max(1,ms-(performance.now()-start)),onProgress:guarded,ponder});if(generation!==this.generation)throw Object.assign(Error('Calculation cancelled'),{name:'AbortError'});return {...r,backend:'wasm',elapsedMs:performance.now()-start};
  }finally{if(generation===this.generation)this.job=null;}
 }
}
