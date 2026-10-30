import {analysisBudget} from './analysis-budget.js';
import {progressReview} from './progress-review.js';
const sameAction=(a,b)=>a.type===b.type&&a.x===b.x&&a.y===b.y&&(a.type!=='wall'||a.o===b.o);
// A single search keeps its tree/cache alive; only completed iterations are published.
export class VariableAnalysis {
 constructor(){this.generation=0;this.active=false;this.pinned=false;}
 get elapsedMs(){return this.active?performance.now()-this.startedAt:this.finishedMs??0;}
 cancel(){this.generation++;clearTimeout(this.timer);clearTimeout(this.budgetTimer);clearInterval(this.pulse);this.active=false;this.pinned=false;this.latest=null;this.displayed=null;this.phase='quick';this.reason=null;this.finishedMs=0;this.history=[];this.changedAt=null;this.previousAction=null;this.lastUpdateAt=null;this.state=null;this.wallStreak=0;this.onStatus?.();}
 async start(engine,state,{cores,wallStreak=0,defenseReply=null,initialResult=null,onPublish,onUpdate,onStatus,onError}){
  this.cancel();const generation=this.generation;this.active=true;this.onStatus=onStatus;this.state=state;this.wallStreak=wallStreak;this.limitMs=15000;
  const start=performance.now();this.startedAt=start;let ready=false,settled=false;const history=this.history;
  const publish=()=>{if(this.latest&&!this.pinned){const old=this.displayed?.pv?.[0],next=this.latest.pv[0];if(old&&!sameAction(old,next)){this.previousAction=old;this.changedAt=performance.now();}this.displayed=this.latest;onPublish(this.latest);}onStatus();};
  this.publish=publish;
  this.timer=setTimeout(()=>{if(generation!==this.generation)return;ready=true;publish();},500);
  onStatus();
  this.pulse=setInterval(()=>{if(generation===this.generation&&this.active)onStatus();},250);
  const finishEarly=()=>{
   if(settled||generation!==this.generation||!this.latest)return;
   const elapsed=performance.now()-start,decision=analysisBudget(state,this.latest,history,elapsed,wallStreak);
   this.phase=decision.phase;this.reason=decision.reason;onStatus();
   if(!decision.stop)return;
   settled=true;this.finishedMs=elapsed;this.active=false;clearTimeout(this.timer);clearTimeout(this.budgetTimer);clearInterval(this.pulse);
   this.latest={...this.latest,done:true,analysisBudget:decision,adaptiveStop:{reason:decision.reason,elapsedMs:elapsed,heuristic:decision.reason!=='exact'}};
   onUpdate(this.latest);publish();engine.cancel();
  };
  this.budgetTimer=setTimeout(finishEarly,2000);
  const accept=(result,done=false)=>{
   if(settled||generation!==this.generation||!result.pv?.length)return;
   if(!done&&this.latest&&(result.depth??0)<(this.latest.depth??0))return;
   if(done&&this.latest&&(result.depth??0)<(this.latest.depth??0))result=this.latest;
   this.latest={...result,progressReview:progressReview(state,result.pv[0]),done,elapsedMs:performance.now()-start};
   this.lastUpdateAt=performance.now();
   if(!history.length||(result.depth??0)>history.at(-1).depth){history.push(this.latest);if(history.length>3)history.shift();}
   const decision=analysisBudget(state,this.latest,history,performance.now()-start,wallStreak);this.phase=done?'complete':decision.phase;this.reason=done?'engine-complete':decision.reason;
   this.latest.analysisBudget={...decision,phase:this.phase,reason:this.reason};
   onUpdate(this.latest);
   if(ready||done)publish();
   if(!done)finishEarly();
  };
  if(initialResult?.pv?.length){ready=true;accept(initialResult);if(settled)return;}
  try{const result=await engine.search(state,{ms:15000,cores,wallStreak,defenseReply,onProgress:r=>accept(r)});
   if(settled||generation!==this.generation)return;this.finishedMs=performance.now()-start;this.active=false;clearTimeout(this.timer);clearTimeout(this.budgetTimer);clearInterval(this.pulse);accept(result,true);
  }catch(error){if(settled||generation!==this.generation)return;this.finishedMs=performance.now()-start;this.active=false;clearTimeout(this.timer);clearTimeout(this.budgetTimer);clearInterval(this.pulse);onStatus();if(error.name!=='AbortError')onError(error);}
 }
 togglePin(){if(!this.displayed)return;this.pinned=!this.pinned;if(!this.pinned)this.publish();else this.onStatus();}
}
