import {distance,legal} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';

/**
 * Research-only SIGMA4-v2: retain root visit/Q weighting, screen weakly explored
 * alternatives and limit stochastic overrides in difficult/endgame positions.
 * No production UI impact. Passed overrides must be the current game's count.
 */
export function chooseAdaptiveWeightedCandidate(state,search,rng,{
 overrides=0, maxOverrides=3,
 baseRate=.72, minVisitRatio=.18, minVisits=10,
 maxQDrop=.065, temperature=1.2,qTemperature=.15,
 dangerDistance=3,maxWallValueDrop=.035,
}={}){
 const native=search?.pv?.[0];
 if(!native||!legal(state,native))throw Error('adaptive SIGMA4 requires legal native root');
 if(overrides>=maxOverrides)return {action:native,changed:false,reason:'override-budget'};
 const own=distance(state,state.turn),opp=distance(state,1-state.turn);
 const dangerous=opp<=dangerDistance||own<=2;
 // Weighting remains enabled in normal positions. Endgames must not be changed by random draw.
 if(dangerous)return {action:native,changed:false,reason:'goal-race-guard'};
 const children=search.diagnostics?.rootChildren??[];
 const leader=children.find(c=>c.action&&Number.isFinite(c.qFromRoot));
 if(!leader)return {action:native,changed:false,reason:'no-root-diagnostics'};
 const filtered=children.filter(c=>{
  if(!c.action||!legal(state,c.action)||!Number.isFinite(c.qFromRoot)||!Number.isFinite(c.visits))return false;
  if(c.visits<Math.max(minVisits,leader.visits*minVisitRatio))return false;
  const allowedDrop=c.action.type==='wall'?maxWallValueDrop:maxQDrop;
  return leader.qFromRoot-c.qFromRoot<=allowedDrop;
 });
 if(!filtered.length)return {action:native,changed:false,reason:'no-quality-supported-alternative'};
 const chosen=chooseWeightedResearchCandidate(state,{
  ...search,diagnostics:{...search.diagnostics,rootChildren:filtered}
 },rng,{rate:baseRate,temperature,qTemperature,maxQDrop:min(maxQDrop,maxWallValueDrop),
  minVisitRatio:0,minVisits,maxCandidates:6});
 return {...chosen,reason:chosen.changed?'quality-screened-weighted-v2':chosen.reason,
  filteredCandidates:filtered.length,overrideCount:overrides};
}
const min=Math.min;
