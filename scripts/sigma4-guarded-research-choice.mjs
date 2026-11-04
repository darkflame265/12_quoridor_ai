import {legal} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';

/** Optional conservative successor to Sigma4 research sampling. Not a production engine. */
export function chooseGuardedSigma4Candidate(state,search,rng,{
  rate=0.58,maxQDrop=0.05,minVisits=8,minVisitRatio=0.20,
  temperature=0.95,qTemperature=0.08,maxRootDominance=0.82
}={}){
 const native=search?.pv?.[0];
 if(!native||!legal(state,native))throw Error('illegal Sigma4 base action');
 const root=(search.diagnostics?.rootChildren||[]).filter(c=>c.action&&legal(state,c.action)&&
  Number.isFinite(c.qFromRoot)&&Number.isFinite(c.visits)&&c.visits>0);
 if(root.length<2)return {action:native,changed:false,reason:'insufficient-search-support'};
 const total=root.reduce((n,c)=>n+c.visits,0),lead=root[0];
 if(lead.visits/total>=maxRootDominance)return {action:native,changed:false,reason:'dominant-native-root'};
 const comparables=root.filter(c=>c.visits>=Math.max(minVisits,lead.visits*minVisitRatio)&&
  lead.qFromRoot-c.qFromRoot<=maxQDrop);
 if(comparables.length<2)return {action:native,changed:false,reason:'no-reliable-alternative'};
 const filtered={...search,diagnostics:{...search.diagnostics,rootChildren:comparables}};
 const selected=chooseWeightedResearchCandidate(state,filtered,rng,{
  rate,maxQDrop,minVisits,minVisitRatio,temperature,qTemperature,maxCandidates:comparables.length
 });
 return {...selected,guard:'conservative-root-confidence'};
}
