import {apply,legal,moves,distance} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const immediateWin=s=>moves(s).find(a=>apply(s,a).winner===s.turn)||null;
function raceScore(s,side){
 const me=distance(s,side),opp=distance(s,1-side);
 return opp-me+0.14*(s.left[side]-s.left[1-side]);
}
/** Research candidate, tactical safety first. No claimed forced full-game win. */
export function chooseTacticalSigma4(state,search,rng,{
 rate=0.66,maxQDrop=0.10,minVisits=6,minVisitRatio=0.1,
 temperature=1.05,qTemperature=.11,maxPathRegression=2.0,
 earlyPly=12,earlyMaxQDrop=.12
}={}){
 const native=search?.pv?.[0];
 if(!native||!legal(state,native))throw Error('invalid native Sigma4 action');
 const self=state.turn;
 const win=immediateWin(state);
 if(win)return {action:win,changed:!same(win,native),reason:'forced-immediate-win',safety:true};
 const base=apply(state,native);
 const nativeThreat=base.winner===null&&Boolean(immediateWin(base));
 const lead=(search.diagnostics?.rootChildren||[])[0];
 const ply=state.ply??(state.historyStates?.length||0);
 const qWindow=ply<earlyPly?earlyMaxQDrop:maxQDrop;
 const candidates=(search.diagnostics?.rootChildren||[]).filter(c=>c.action&&legal(state,c.action)&&c.visits>=minVisits&&Number.isFinite(c.qFromRoot));
 const high=lead&&Number.isFinite(lead.qFromRoot)?lead.qFromRoot:0;
 const bestAfter=raceScore(base,self);
 const pool=candidates.filter(c=>c.visits>=Math.max(minVisits,(lead?.visits||0)*minVisitRatio)&&high-c.qFromRoot<=qWindow)
 .filter(c=>{
  const after=apply(state,c.action);
  if(after.winner===self)return true;
  if(after.winner!==null)return false;
  if(immediateWin(after))return false;
  if(!nativeThreat&&bestAfter-raceScore(after,self)>maxPathRegression)return false;
  return true;
 });
 // Preserve baseline if no alternative passes. If baseline allows a one-move loss, prefer a searched escape.
 const cleanNative=pool.find(c=>same(c.action,native));
 if(!pool.length)return {action:native,changed:false,reason:nativeThreat?'no-search-supported-safe-escape':'no-safe-candidate',safety:false};
 if(nativeThreat&&!cleanNative){
  const best=pool.sort((a,b)=>b.qFromRoot-a.qFromRoot||b.visits-a.visits)[0];
  return {action:best.action,changed:!same(best.action,native),reason:'avoid-next-turn-loss',safety:true};
 }
 const candidateSearch={...search,diagnostics:{...search.diagnostics,rootChildren:pool}};
 const selected=chooseWeightedResearchCandidate(state,candidateSearch,rng,{rate,maxQDrop:qWindow,
  minVisits,minVisitRatio,temperature,qTemperature,maxCandidates:pool.length});
 return {...selected,reason:selected.changed?'tactical-safe-weighted-choice':selected.reason,
  safety:true,filterCount:candidates.length-pool.length};
}
