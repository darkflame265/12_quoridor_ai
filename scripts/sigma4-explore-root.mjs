import {legal} from '../src/engine.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function chooseResearchCandidate(state,search,rng,{rate=0.38,maxQDrop=0.12,minVisitRatio=0.06,maxAlternatives=3}={}){
 const original=search?.pv?.[0];
 if(!original||!legal(state,original))throw Error('research root requires a legal engine action');
 const pool=(search.diagnostics?.rootChildren||[]).filter(c=>c.action&&legal(state,c.action)&&c.visits>=5&&Number.isFinite(c.qFromRoot));
 const lead=pool[0];
 if(!lead||rng()>=rate)return {action:original,changed:false,alternatives:0};
 const viable=pool.filter(c=>c.visits>=Math.max(5,lead.visits*minVisitRatio)&&lead.qFromRoot-c.qFromRoot<=maxQDrop&&!same(c.action,original)).slice(0,maxAlternatives);
 if(!viable.length)return {action:original,changed:false,alternatives:0};
 const candidate=viable[Math.floor(rng()*viable.length)].action;
 return {action:candidate,changed:!same(candidate,original),alternatives:viable.length};
}
