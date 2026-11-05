import {apply,distance,legal,moves} from '../src/engine.js';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const immediateGoal=(state)=>moves(state).some(a=>apply(state,a).winner===state.turn);
function afterReplyScore(state,action,response){
 const next=apply(state,action),opp=next.turn,our=state.turn;
 if(next.winner===our)return 10000;
 const reply=response?.pv?.[0];
 if(!reply||!legal(next,reply))throw Error('invalid researched opponent reply');
 const result=apply(next,reply);
 if(result.winner===opp)return -10000;
 return distance(result,opp)-distance(result,our)+.35*(result.left[our]-result.left[opp]);
}
/**
 * Research only. Selectively verifies a suspicious midgame sampled move
 * with an actual opponent continuation. The native action must be also
 * searched as a control, avoiding score comparisons of mismatched depth.
 * Root 200-sim plus two 50-sim reply probes is NOT a 500-ms engine.
 */
export async function chooseSigma4MidgameReplyV9(state,root,rng,replySearch,options={}){
 const base=chooseWeightedTacticalV3(state,root,rng,options);
 const native=root?.pv?.[0],sampled=base.action;
 const ply=Number(options.ply??0);
 if(Number(root.elapsedMs??0)>Number(options.midgameRootCapMs??650))
  return {...base,replyV9:'root-over-budget'};
 if(ply<Number(options.minPly??10)||ply>Number(options.maxPly??42))
  return {...base,replyV9:'outside-midgame'};
 if(!native||!legal(state,native)||!legal(state,sampled)||same(native,sampled))
  return {...base,replyV9:'no-disagreement'};
 if(base.reason!=='visit-and-q-weighted')
  return {...base,replyV9:'safety-guard-dominated'};
 const children=root?.diagnostics?.rootChildren??[];
 const nc=children.find(c=>same(c.action,native)),sc=children.find(c=>same(c.action,sampled));
 const qGap=nc&&sc&&Number.isFinite(nc.qFromRoot)&&Number.isFinite(sc.qFromRoot)?nc.qFromRoot-sc.qFromRoot:0;
 const own=state.turn,opp=1-own,afterNative=apply(state,native),afterSampled=apply(state,sampled);
 const pathRisk=(distance(afterSampled,own)-distance(afterNative,own)>=1)
  || (distance(afterNative,opp)-distance(afterSampled,opp)>=1);
 const risky=pathRisk||qGap>=Number(options.midgameRiskQ??.07);
 if(!risky)return {...base,replyV9:'quiet',qGap};
 if(afterNative.winner===own)return {action:native,changed:false,reason:'v9-native-win',replyV9:'win'};
 if(immediateGoal(afterNative))return {...base,replyV9:'native-immediate-risk'};
 if(immediateGoal(afterSampled))return {action:native,changed:false,reason:'v9-immediate-threat',replyV9:'immediate-threat'};
 try{
  // Sequential probes avoid concurrent inference contention.
  const sampledReply=await replySearch(afterSampled);
  const nativeReply=await replySearch(afterNative);
  const sampledScore=afterReplyScore(state,sampled,sampledReply);
  const nativeScore=afterReplyScore(state,native,nativeReply);
  const margin=Number(options.midgameReplyMargin??2);
  if(nativeScore-sampledScore>=margin)
   return {action:native,changed:false,reason:'v9-reply-rejected-sample',replyV9:'rejected',
    sampledScore,nativeScore,qGap};
  return {...base,replyV9:'accepted',sampledScore,nativeScore,qGap};
 }catch(e){
  return {...base,replyV9:'unavailable',error:String(e?.message??e)};
 }
}
