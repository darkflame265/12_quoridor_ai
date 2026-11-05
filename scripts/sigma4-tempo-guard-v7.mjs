import {apply,distance,legal,moves} from '../src/engine.js';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const immediateLoss=(s,a)=>{
 const next=apply(s,a);
 return next.winner===null&&moves(next).some(r=>apply(next,r).winner===next.turn);
};
/**
 * V7 research tempo guard. When badly behind, replace a zero-impact wall with
 * a legal pawn step that objectively reduces own shortest-path distance.
 * Deliberately conservative: zero-distance walls can be strategic, so never
 * use as production policy without paired full-game evidence.
 */
export function chooseWeightedTempoV7(state,search,rng,opts={}){
 const base=chooseWeightedTacticalV3(state,search,rng,opts);
 if(base.action.type!=='wall'||base.reason==='immediate-own-win')
  return {...base,tempoGate:'not-wall'};
 const own=state.turn,opp=1-own;
 const ownDist=distance(state,own),oppDist=distance(state,opp);
 const deficit=ownDist-oppDist;
 if(deficit<Number(opts.tempoDeficit??4))return {...base,tempoGate:'not-behind',deficit};
 const after=apply(state,base.action);
 const ownChange=distance(after,own)-ownDist,oppChange=distance(after,opp)-oppDist;
 if(oppChange>0 && ownChange<=0)
  return {...base,tempoGate:'useful-wall',deficit,ownChange,oppChange};
 // Resolve using a clear pawn progression, never an unvalidated alternative wall.
 const root=search.diagnostics?.rootChildren??[];
 const suggested=root.filter(c=>c.action?.type==='move'&&legal(state,c.action));
 const fallback=moves(state).filter(a=>a.type==='move'&&legal(state,a))
  .map(a=>({action:a,visits:0,qFromRoot:-1}));
 const candidates=[...suggested,...fallback]
  .filter(c=>!immediateLoss(state,c.action))
  .map(c=>({...c,progress:ownDist-distance(apply(state,c.action),own)}))
  .filter(c=>c.progress>=1)
  .sort((a,b)=>b.progress-a.progress||Number(b.visits||0)-Number(a.visits||0)||Number(b.qFromRoot||-1)-Number(a.qFromRoot||-1));
 if(!candidates.length)return {...base,tempoGate:'no-safe-progress',deficit,ownChange,oppChange};
 // Avoid overriding a clearly good defended wall when enemy's route increases.
 if(oppChange>0&&ownChange<=1&&deficit<Number(opts.tempoSevereDeficit??7))
  return {...base,tempoGate:'possible-defensive-wall',deficit,ownChange,oppChange};
 const pick=candidates[0].action;
 return {action:pick,changed:!same(pick,search.pv[0]),reason:'v7-avoid-losing-tempo-wall',tempoGate:'replaced',
  priorAction:base.action,deficit,ownChange,oppChange,progress:candidates[0].progress};
}
