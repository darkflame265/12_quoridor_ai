import {initial,clone,legal,apply} from '../game/engine.js';

export function positionKey(s){
 const walls=s.walls.map(w=>`${w.o}:${w.x}:${w.y}`).sort();
 return JSON.stringify([s.p.map(p=>[p.x,p.y]),s.left,s.turn,walls]);
}

// These draw limits apply to observation only; they do not alter Quoridor legality.
export function observationOutcome(state,past,{maxPlies=300,repetitions=3}={}){
 if(state.winner!==null)return {type:'win',winner:state.winner,reason:'goal'};
 if(past.length>=maxPlies)return {type:'draw',winner:null,reason:'move-limit'};
 const key=positionKey(state);let count=1;
 for(const s of past)if(positionKey(s)===key&&++count>=repetitions)return {type:'draw',winner:null,reason:'repetition'};
 return null;
}

export function replayRecords(data){
 if(!data||!Array.isArray(data.records)||data.records.length>10000)throw Error('기보 형식 오류');
 let state=initial();const past=[];
 for(const action of data.records){if(!action||!legal(state,action))throw Error('불가능한 수가 포함된 기보입니다.');past.push(clone(state));state=apply(state,action);}
 return {state,past,records:clone(data.records)};
}

export class SpectatorRunner{
 constructor({getState,getOutcome,search,cancelSearch,commit,onAnalysis=()=>{},onChange=()=>{},onError=()=>{},getDelay=()=>500,setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=id=>clearTimeout(id)}){
  Object.assign(this,{getState,getOutcome,search,cancelSearch,commit,onAnalysis,onChange,onError,getDelay,setTimer,clearTimer});
  this.running=false;this.thinking=false;this.phase='paused';this.timer=null;this.generation=0;
 }
 pause(){this.running=false;this.thinking=false;this.phase='paused';this.generation++;if(this.timer!==null)this.clearTimer(this.timer);this.timer=null;this.cancelSearch();this.onChange();}
 start(){if(this.running)return;this.pause();if(this.getOutcome()){this.phase='finished';this.onChange();return;}this.running=true;this.advance(this.generation);}
 step(){this.pause();if(this.getOutcome()){this.phase='finished';this.onChange();return;}this.advance(this.generation);}
 async advance(generation){
  if(generation!==this.generation)return;
  if(this.getOutcome()){this.running=false;this.phase='finished';this.onChange();return;}
  this.thinking=true;this.phase='thinking';this.onChange();
  try{
   const snapshot=clone(this.getState());
   const result=await this.search(snapshot,r=>{if(generation===this.generation)this.onAnalysis(r);});
   if(generation!==this.generation)return;
   const action=result.pv?.[0];if(!action||!legal(this.getState(),action))throw Error('AI가 합법적인 수를 반환하지 않았습니다.');
   this.thinking=false;this.onAnalysis(result);this.commit(action,result);
   if(generation!==this.generation)return;
   if(this.getOutcome()){this.running=false;this.phase='finished';}
   else if(this.running){this.phase='waiting';this.timer=this.setTimer(()=>{this.timer=null;this.advance(generation);},Math.max(0,Math.min(5000,Number(this.getDelay())||0)));}
   else this.phase='paused';
   this.onChange();
  }catch(error){if(generation!==this.generation)return;this.running=false;this.thinking=false;this.phase='paused';this.onChange();if(error.name!=='AbortError')this.onError(error);}
 }
}
