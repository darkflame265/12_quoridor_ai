import {apply,legal,moves,distance} from '../game/engine.js';
import {boardKey} from '../capture/screen-sync.js';

export const ponderKey=(s,o)=>JSON.stringify([boardKey(s),s.turn,s.winner,s.recentPawnSquares??[],s.ownTurnHistory??[],s.wallRun??[],o.wallStreak??0,o.defenseReply??null]);
function nearbyBlock(state){
 if(!state.left[state.turn])return null;
 const target=1-state.turn,p=state.p[target],before=distance(state,target),own=distance(state,state.turn),rows=[];
 // A small local set keeps screen recognition responsive; the native search
 // supplies the principal opponent move, including distant walls when chosen.
 for(const o of ['h','v'])for(const x of [p.x-1,p.x])for(const y of [p.y-1,p.y]){
  const a={type:'wall',x,y,o};if(!legal(state,a))continue;
  const next=apply(state,a),delay=distance(next,target)-before;
  if(delay>0)rows.push({a,gain:delay-(distance(next,state.turn)-own)});
 }
 rows.sort((a,b)=>b.gain-a.gain);return rows[0]?.a;
}
// One low-priority job uses the same native engine/cache as foreground search.
// No predicted state is ever committed to the visible board.
export class ScreenPonder {
 constructor(){this.generation=0;this.cache=new Map();}
 stop({clear=false}={}){this.generation++;if(this.running){this.engine?.cancel();this.running=false;}this.position=null;if(clear){this.cache.clear();this.engine=null;}}
 take(engine,state,options){
  const entry=this.cache.get(ponderKey(state,options));
  if(!entry||!entry.complete||entry.engine!==engine||entry.build!==engine.native?.info?.engineInfo?.build||Date.now()-entry.at>60000||!legal(state,entry.result.pv[0]))return null;
  return {...structuredClone(entry.result),done:false,ponderReused:true,ponderMs:entry.computeMs};
 }
 async start(engine,state,{prepare,valid,onStatus=()=>{}}){
  const position=boardKey(state)+':'+state.turn;
  if(this.running&&this.engine===engine&&this.position===position)return;
  this.stop();this.engine=engine;this.position=position;this.running=true;
  const generation=this.generation,started=performance.now(),current=()=>generation===this.generation&&valid();
  try{
   onStatus('thinking');
   const opponent=await engine.search(state,{ms:700,cores:1,ponder:true});
   if(!current())return;
   const forward=moves(state).sort((a,b)=>distance(apply(state,a),state.turn)-distance(apply(state,b),state.turn));
   const same=(a,b)=>a&&b&&a.type===b.type&&a.x===b.x&&a.y===b.y&&(a.type!=='wall'||a.o===b.o);
   const options=[opponent.pv?.[0],forward[0],nearbyBlock(state),...forward].filter((a,i,all)=>a&&legal(state,a)&&all.findIndex(b=>same(a,b))===i).slice(0,3);
   for(const ms of [1000,2000,3000])for(const action of options){
    if(!current()||performance.now()-started>=15000)return;
    const child=apply(state,action);if(child.winner!==null)continue;
    const prepared=prepare(child,action),key=ponderKey(prepared.state,prepared.options),computeStart=performance.now();
    const save=(result,complete=false)=>{
     if(!current()||!result.pv?.length||!legal(child,result.pv[0]))return;
     const old=this.cache.get(key);if(old?.engine===engine&&(old.result.depth??0)>(result.depth??0))return;
     this.cache.set(key,{engine,build:engine.native?.info?.engineInfo?.build,at:Date.now(),result:structuredClone(result),computeMs:performance.now()-computeStart,complete});
     if(this.cache.size>6)this.cache.delete(this.cache.keys().next().value);
    };
    const result=await engine.search(prepared.state,{...prepared.options,ms:Math.min(ms,15000-(performance.now()-started)),cores:1,ponder:true,onProgress:save});
    save(result,true);
   }
  }catch(error){if(current()&&error.name!=='AbortError')onStatus('unavailable');}
  finally{if(generation===this.generation){this.running=false;onStatus('idle');}}
 }
}
