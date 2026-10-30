import {analysisBudget} from './analysis-budget.js';
import {progressReview} from './progress-review.js';
export const VARIABLE_MIN_MS=500;
export const VARIABLE_MAX_MS=2000;
// Iterations stay private until a single recommendation is finalized.
export class VariableAnalysis {
 constructor(){this.generation=0;this.active=false;this.pinned=false;}
 get elapsedMs(){return this.active?performance.now()-this.startedAt:this.finishedMs??0;}
 cancel(){this.generation++;clearTimeout(this.timer);clearTimeout(this.budgetTimer);clearInterval(this.pulse);this.active=false;this.pinned=false;this.latest=null;this.displayed=null;this.phase='quick';this.reason=null;this.finishedMs=0;this.history=[];this.changedAt=null;this.previousAction=null;this.lastUpdateAt=null;this.state=null;this.wallStreak=0;this.publish=()=>{};this.onStatus?.();}
 async start(engine,state,{cores,wallStreak=0,defenseReply=null,initialResult=null,onPublish,onUpdate=()=>{},onStatus=()=>{},onError=()=>{}}){
  this.cancel();const generation=this.generation;this.active=true;this.onStatus=onStatus;this.state=state;this.wallStreak=wallStreak;this.limitMs=VARIABLE_MAX_MS;
  const start=performance.now();this.startedAt=start;let settled=false,engineDone=false;const history=this.history;
  const current=()=>generation===this.generation&&!settled;
  const cleanup=()=>{clearTimeout(this.timer);clearTimeout(this.budgetTimer);clearInterval(this.pulse);};
  this.publish=()=>{if(generation===this.generation&&this.displayed)onPublish(this.displayed);};
  const finish=reason=>{
   if(!current())return;
   settled=true;cleanup();this.finishedMs=Math.min(VARIABLE_MAX_MS,performance.now()-start);this.active=false;this.phase='complete';this.reason=reason;
   if(this.latest){
    this.latest={...this.latest,done:true,analysisBudget:{stop:true,reason,phase:'complete'},adaptiveStop:{reason,elapsedMs:this.finishedMs,heuristic:reason!=='exact'}};
    this.displayed=this.latest;this.pinned=true;onUpdate(this.latest);this.publish();onStatus();
   }else{onStatus();onError(new Error('2초 안에 완료된 탐색 결과를 얻지 못했습니다. 다시 분석해 주세요.'));}
   engine.cancel();
  };
  const consider=()=>{
   if(!current()||!this.latest)return;
   const elapsed=performance.now()-start,decision=analysisBudget(state,this.latest,history,elapsed,wallStreak);
   this.phase=decision.phase;this.reason=decision.reason;
   if(this.latest.exact===true)finish('exact');
   else if(elapsed>=VARIABLE_MAX_MS)finish('time-limit');
   else if(elapsed>=VARIABLE_MIN_MS&&(engineDone||decision.stop))finish(engineDone?'engine-complete':decision.reason);
   else onStatus();
  };
  const accept=result=>{
   if(!current()||!result?.pv?.length)return;
   if(this.latest&&(result.depth??0)<(this.latest.depth??0))return;
   this.latest={...result,progressReview:progressReview(state,result.pv[0]),done:false,elapsedMs:performance.now()-start};this.lastUpdateAt=performance.now();
   if(!history.length||(result.depth??0)>history.at(-1).depth){history.push(this.latest);if(history.length>3)history.shift();}
   onUpdate(this.latest);consider();
  };
  this.timer=setTimeout(consider,VARIABLE_MIN_MS);
  this.budgetTimer=setTimeout(()=>finish('time-limit'),VARIABLE_MAX_MS);
  this.pulse=setInterval(()=>{if(current())onStatus();},250);onStatus();
  if(initialResult?.pv?.length){accept(initialResult);if(settled)return;}
  try{
   const result=await engine.search(state,{ms:VARIABLE_MAX_MS,cores,wallStreak,defenseReply,onProgress:r=>accept(r)});
   if(!current())return;engineDone=true;accept(result);consider();
  }catch(error){
   if(!current())return;
   if(this.latest){engineDone=true;consider();return;}
   settled=true;cleanup();this.finishedMs=performance.now()-start;this.active=false;onStatus();if(error.name!=='AbortError')onError(error);
  }
 }
 // A finalized recommendation cannot be unpinned within the same analysis.
 togglePin(){}
}
