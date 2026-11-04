import {legal} from '../src/engine.js';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/**
 * Research-only root choice. Uses MCTS visits *and* root Q, with a bounded
 * preference for already explored candidates. This is not a production policy.
 */
export function chooseWeightedResearchCandidate(state,search,rng,{
  rate=0.65, maxQDrop=0.14, minVisits=5, minVisitRatio=0.06,
  temperature=0.9, qTemperature=0.10, maxCandidates=6,
  includeOriginal=true
}={}){
 const original=search?.pv?.[0];
 if(!original||!legal(state,original))throw Error('research choice requires a legal engine action');
 const children=(search.diagnostics?.rootChildren||[])
  .filter(c=>c.action&&legal(state,c.action)&&Number.isFinite(c.qFromRoot)&&
   Number.isFinite(c.visits)&&c.visits>=minVisits);
 if(!children.length||rng()>=rate)return {action:original,changed:false,reason:'native',candidates:0};
 const lead=children[0], best=lead.qFromRoot;
 const pool=children.filter(c=>c.visits>=Math.max(minVisits,lead.visits*minVisitRatio)&&
   best-c.qFromRoot<=maxQDrop&&(includeOriginal||!same(c.action,original))).slice(0,maxCandidates);
 if(!pool.length)return {action:original,changed:false,reason:'no-comparable-candidates',candidates:0};
 const highest=Math.max(...pool.map(c=>c.qFromRoot));
 const weights=pool.map(c=>Math.pow(c.visits,1/temperature)*Math.exp((c.qFromRoot-highest)/qTemperature));
 const total=weights.reduce((a,b)=>a+b,0);
 if(!Number.isFinite(total)||total<=0)throw Error('invalid research root weights');
 let sample=rng()*total;
 let chosen=pool.at(-1);
 for(let i=0;i<pool.length;i++){sample-=weights[i];if(sample<0){chosen=pool[i];break;}}
 return {action:chosen.action,changed:!same(chosen.action,original),
  reason:'visit-and-q-weighted',candidates:pool.length,
  selectedVisits:chosen.visits,selectedQ:chosen.qFromRoot,
  probability:weights[pool.indexOf(chosen)]/total,
  weightTotal:total};
}
