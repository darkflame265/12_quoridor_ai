// A single search keeps its tree/cache alive; only completed iterations are published.
export class VariableAnalysis {
 constructor(){this.generation=0;this.active=false;this.pinned=false;}
 cancel(){this.generation++;clearTimeout(this.timer);this.active=false;this.pinned=false;this.latest=null;this.displayed=null;this.onStatus?.();}
 async start(engine,state,{cores,wallStreak=0,onPublish,onUpdate,onStatus,onError}){
  this.cancel();const generation=this.generation;this.active=true;this.onStatus=onStatus;
  const start=performance.now();let ready=false;
  const publish=()=>{if(this.latest&&!this.pinned){this.displayed=this.latest;onPublish(this.latest);}onStatus();};
  this.publish=publish;
  this.timer=setTimeout(()=>{if(generation!==this.generation)return;ready=true;publish();},500);
  onStatus();
  const accept=(result,done=false)=>{
   if(generation!==this.generation||!result.pv?.length)return;
   if(!done&&this.latest&&(result.depth??0)<(this.latest.depth??0))return;
   this.latest={...result,done,elapsedMs:performance.now()-start};onUpdate(this.latest);
   if(ready||done)publish();
  };
  try{const result=await engine.search(state,{ms:15000,cores,wallStreak,onProgress:r=>accept(r)});
   if(generation!==this.generation)return;this.active=false;clearTimeout(this.timer);accept(result,true);
  }catch(error){if(generation!==this.generation)return;this.active=false;clearTimeout(this.timer);onStatus();if(error.name!=='AbortError')onError(error);}
 }
 togglePin(){if(!this.displayed)return;this.pinned=!this.pinned;if(!this.pinned)this.publish();else this.onStatus();}
}
