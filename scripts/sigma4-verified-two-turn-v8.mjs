import {apply,distance,legal,moves,validWall} from '../src/engine.js';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const goalNext=s=>moves(s).some(a=>apply(s,a).winner===s.turn);
const legalAll=s=>{
 const result=[...moves(s)];
 if(s.left[s.turn]===0)return result;
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  const a={type:'wall',x,y,o};
  if(validWall(s,a))result.push(a);
 }
 return result;
};
/**
 * A narrowly scoped, exhaustive proof of one specific forced loss:
 * opponent moves a pawn, we respond with ANY legal move/wall,
 * opponent scores the winning pawn move. No heuristic path threshold
 * is treated as a proof. Only called when opponent distance <= 2.
 *
 * No winning guarantee for other positions, and runtime unbounded near
 * goal when many wall defenses remain. Research only.
 */
export function opponentForcedPawnGoalInTwo(state,ourAction){
 if(!legal(state,ourAction))throw Error('invalid candidate');
 const after=apply(state,ourAction),opp=after.turn;
 if(after.winner!==null)return {forced:false,reason:'already-terminal',searched:0};
 const d=distance(after,opp);
 if(d>2)return {forced:false,reason:'opponent-too-far',searched:0};
 if(goalNext(after))return {forced:true,reason:'goal-in-one',searched:0};
 let searched=0;
 for(const attack of moves(after)){
  const threatened=apply(after,attack);
  if(threatened.winner===opp)return {forced:true,reason:'goal-in-one',searched};
  if(distance(threatened,opp)>1)continue;
  let safeReply=false;
  for(const reply of legalAll(threatened)){
   searched++;
   const next=apply(threatened,reply);
   if(next.winner===1-opp || !goalNext(next)){safeReply=true;break;}
  }
  if(!safeReply)return {forced:true,reason:'unblockable-two-turn-pawn-goal',attack,searched};
 }
 return {forced:false,reason:'no-proven-pawn-goal',searched};
}
export function chooseVerifiedTwoTurnV8(state,search,rng,options={}){
 const base=chooseWeightedTacticalV3(state,search,rng,options);
 if(distance(state,1-state.turn)>2 || base.reason==='immediate-own-win')
  return {...base,proofGate:'not-required'};
 const p=opponentForcedPawnGoalInTwo(state,base.action);
 if(!p.forced)return {...base,proofGate:'candidate-safe',proof:p};
 const root=search?.diagnostics?.rootChildren??[];
 const alternatives=[...root.map(c=>c.action).filter(Boolean),...moves(state)];
 const seen=new Set([JSON.stringify(base.action)]);
 for(const action of alternatives){
  const key=JSON.stringify(action);
  if(seen.has(key)||!legal(state,action))continue;
  seen.add(key);
  const check=opponentForcedPawnGoalInTwo(state,action);
  if(!check.forced)
   return {action,changed:!same(action,search.pv[0]),reason:'v8-verified-two-turn-escape',proofGate:'escaped',
     rejected:base.action,proof:p,safeAlternative:check};
 }
 return {...base,proofGate:'no-proven-escape',proof:p};
}
