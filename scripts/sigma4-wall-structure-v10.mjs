import {apply,distance,legal,moves} from '../src/engine.js';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

/**
 * Research-only wall value: shortest path detour after placement, self-detour,
 * and whether the detour survives the opponent's best legal pawn response.
 * Never overrides a pawn with a wall, a tactical emergency, or a decisive
 * MCTS Q lead. It is NOT a proved optimal wall valuation.
 */
export function evaluateWallStructure(state,action){
 if(action.type!=='wall'||!legal(state,action))throw Error('wall evaluation needs legal wall');
 const own=state.turn,opponent=1-own;
 const ownBefore=distance(state,own),opponentBefore=distance(state,opponent);
 const next=apply(state,action);
 const ownAfter=distance(next,own),opponentAfter=distance(next,opponent);
 const enemyPawnReplies=moves(next);
 let opponentProgress=0;
 let afterBestPawn=opponentAfter;
 for(const reply of enemyPawnReplies){
  const after=apply(next,reply);
  const dist=distance(after,opponent);
  if(dist<afterBestPawn)afterBestPawn=dist;
  opponentProgress=Math.max(opponentProgress,opponentAfter-dist);
 }
 const ownDetour=ownAfter-ownBefore;
 const opponentDetour=opponentAfter-opponentBefore;
 // One-step opponent pawn advance and its effect on path geometry.
 const persistentDetour=afterBestPawn-(opponentBefore-1);
 const netDetour=opponentDetour-ownDetour;
 const score=opponentDetour*1.25-ownDetour*1.6 + Math.max(-1,Math.min(2,persistentDetour))*.35;
 return {score,ownDetour,opponentDetour,netDetour,persistentDetour,opponentProgress,
  ownAfter,opponentAfter,replyCount:enemyPawnReplies.length};
}

/**
 * V10 retains Sigma4 V3 instant-win/goal-in-one defenses, only resolving
 * disagreements BETWEEN two walls when native wall has better structural
 * evaluation and at least similar MCTS root Q. This avoids V7's broadly
 * damaging pawn-for-wall overrides. Evaluation is applied to a tiny subset
 * of roots, not to every legal wall candidate.
 */
export function chooseSigma4WallStructureV10(state,root,rng,options={}){
 const base=chooseWeightedTacticalV3(state,root,rng,options);
 const original=root?.pv?.[0],chosen=base.action;
 if(!original||!legal(state,original)||!legal(state,chosen))
  throw Error('V10 requires legal root and sampled action');
 if(base.reason!=='visit-and-q-weighted'||eq(original,chosen))
  return {...base,wallV10:'no-comparable-sample'};
 if(original.type!=='wall'||chosen.type!=='wall')
  return {...base,wallV10:'non-wall-contrast'};
 const children=root.diagnostics?.rootChildren??[];
 const nc=children.find(x=>eq(x.action,original)),sc=children.find(x=>eq(x.action,chosen));
 if(!nc||!sc||!Number.isFinite(nc.qFromRoot)||!Number.isFinite(sc.qFromRoot))
  return {...base,wallV10:'missing-root-q'};
 const qLead=nc.qFromRoot-sc.qFromRoot;
 if(qLead<Number(options.wallMinQLead??0))
  return {...base,wallV10:'native-q-not-better',qLead};
 const nativeMetric=evaluateWallStructure(state,original);
 const sampledMetric=evaluateWallStructure(state,chosen);
 const gain=nativeMetric.score-sampledMetric.score;
 const margin=Number(options.wallScoreMargin??1);
 if(gain>=margin)
  return {action:original,changed:false,reason:'v10-better-persistent-wall',
   wallV10:'replaced',qLead,gain,nativeMetric,sampledMetric,priorAction:chosen};
 return {...base,wallV10:'retained',qLead,gain,nativeMetric,sampledMetric};
}
