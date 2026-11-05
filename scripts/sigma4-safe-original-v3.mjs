import {moves,apply,legal} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {findEmergencyDefense} from './sigma4-tactical-escape.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const immediateWin=state=>moves(state).find(a=>apply(state,a).winner===state.turn);
const losesImmediately=(state,action)=>{
 const next=apply(state,action);
 return next.winner===null&&Boolean(immediateWin(next));
};
/**
 * Minimal provable one-reply safety wrapper for the ORIGINAL weighted Sigma4.
 * Unlike conservative-v2, never suppresses diversity merely due to visits,
 * Q gap or budget; only prohibits a sampled action exposing a goal-in-one.
 */
export function chooseWeightedTacticalV3(state,search,rng,options={}){
 const native=search?.pv?.[0];
 if(!native||!legal(state,native))throw Error('SIGMA4-v3 requires a legal native action');
 const ownWin=immediateWin(state);
 if(ownWin)return {action:ownWin,changed:!same(ownWin,native),reason:'immediate-own-win'};
 const selected=chooseWeightedResearchCandidate(state,search,rng,{
  rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06,...options
 });
 if(!losesImmediately(state,selected.action))return {...selected,tacticalSafety:'verified'};
 if(!losesImmediately(state,native))
  return {action:native,changed:false,reason:'prevent-immediate-opponent-goal',tacticalSafety:'native-safe'};
 // Search MCTS top children for a legal candidate stopping the goal-in-one.
 const children=search.diagnostics?.rootChildren??[];
 for(const c of children){
  if(c.action&&legal(state,c.action)&&!losesImmediately(state,c.action))
   return {action:c.action,changed:!same(c.action,native),reason:'searched-immediate-goal-defense',tacticalSafety:'searched-safe'};
 }
 const emergency=findEmergencyDefense(state);
 if(emergency&&legal(state,emergency.action)&&!losesImmediately(state,emergency.action))
  return {action:emergency.action,changed:!same(emergency.action,native),reason:'exhaustive-immediate-goal-defense',tacticalSafety:'all-legal-defense'};
 // No safe move was found even among all legal actions.
 return {...selected,tacticalSafety:'unresolved-in-root'};
}
