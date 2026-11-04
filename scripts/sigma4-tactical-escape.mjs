import {moves,validWall,apply,distance} from '../src/engine.js';
import {chooseTacticalSigma4} from './sigma4-tactical-choice.mjs';
const immediateWin=s=>moves(s).some(a=>apply(s,a).winner===s.turn);
/** Exhaustive one-turn defense is used ONLY when the model's top candidates all fail to stop a next-move loss. */
export function findEmergencyDefense(state){
 const side=state.turn;
 const actions=moves(state);
 if(state.left[side]>0){
  for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
   const wall={type:'wall',x,y,o};
   if(validWall(state,wall))actions.push(wall);
  }
 }
 const safe=[];
 for(const action of actions){
  const after=apply(state,action);
  if(after.winner===side)return {action,reason:'immediate-win'};
  if(after.winner!==null||immediateWin(after))continue;
  const own=distance(after,side),opp=distance(after,1-side);
  const score=opp-own-(action.type==='wall'?.2:0)+(after.left[side]-after.left[1-side])*.12;
  safe.push({action,score});
 }
 safe.sort((a,b)=>b.score-a.score);
 return safe[0]??null;
}
export function chooseTacticalSigma4WithEmergency(state,search,rng,opts={}){
 const first=chooseTacticalSigma4(state,search,rng,opts);
 if(first.reason!=='no-search-supported-safe-escape')return first;
 const defense=findEmergencyDefense(state);
 if(!defense)return {...first,reason:'no-legal-one-move-defense-exists'};
 return {action:defense.action,changed:JSON.stringify(first.action)!==JSON.stringify(defense.action),
 reason:'exhaustive-immediate-loss-defense',safety:true};
}
