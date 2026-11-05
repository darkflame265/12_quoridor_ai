import {apply,distance,legal,moves} from '../src/engine.js';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const threat=(s,a)=>{const n=apply(s,a);return n.winner===null&&moves(n).some(b=>apply(n,b).winner===n.turn);};
const score=(s,own)=>distance(s,1-own)-distance(s,own)+.35*(s.left[own]-s.left[1-own]);
/**
 * Research-only selective opponent-reply policy. A strict supplementary deadline
 * bounds waiting, NOT the original root MCTS or underlying worker execution.
 * The supplied replySearch should implement cancellation if used in production.
 */
export async function chooseWeightedSelectiveV6(state,root,rng,replySearch,options={}){
 const base=chooseWeightedTacticalV3(state,root,rng,options);
 const native=root?.pv?.[0],sampled=base.action;
 if(!native||!legal(state,native)||!legal(state,sampled)||equal(native,sampled)||base.reason!=='visit-and-q-weighted')
  return {...base,selective:'no-override'};
 if(threat(state,native))return {...base,selective:'native-unsafe'};
 const own=state.turn,enemy=1-own;
 const nextSampled=apply(state,sampled),nextNative=apply(state,native);
 const ownDelta=distance(nextSampled,own)-distance(nextNative,own);
 const enemyGain=distance(nextNative,enemy)-distance(nextSampled,enemy);
 const roots=root.diagnostics?.rootChildren??[];
 const weighted=roots.find(c=>equal(c.action,sampled));
 const best=roots.find(c=>equal(c.action,native));
 const qGap=best&&weighted&&Number.isFinite(best.qFromRoot)&&Number.isFinite(weighted.qFromRoot)
  ?best.qFromRoot-weighted.qFromRoot:0;
 // Avoid expensive response searches in quiet positions.
 const suspicious=enemyGain>=1||ownDelta>=2||qGap>=Number(options.qRisk??0.08);
 if(!suspicious)return {...base,selective:'quiet'};
 const limit=Math.max(0,Number(options.moveBudgetMs??500)-Number(root.elapsedMs??0)-Number(options.reserveMs??25));
 if(limit<Number(options.minReplyMs??80))return {...base,selective:'budget-exhausted',remainingMs:limit};
 const evaluate=async action=>{
  const next=apply(state,action);
  if(next.winner===own)return 1000;
  const response=await replySearch(next);
  const reply=response?.pv?.[0];
  if(!reply||!legal(next,reply))throw Error('illegal opponent reply');
  const future=apply(next,reply);
  if(future.winner===enemy)return -1000;
  return score(future,own);
 };
 let timer;
 try{
  const analysis=Promise.all([evaluate(sampled),evaluate(native)]);
  // Attach both rejection handlers through Promise.all, including late completion.
  const timeout=new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('supplemental deadline')),limit);});
  const [sampleScore,nativeScore]=await Promise.race([analysis,timeout]);
  if(nativeScore-sampleScore>=Number(options.replyMargin??2))
   return {action:native,changed:false,reason:'selective-reply-gate',selective:'compared',sampleScore,nativeScore};
  return {...base,selective:'compared',sampleScore,nativeScore};
 }catch(e){
  return {...base,selective:'fallback',error:String(e?.message??e)};
 }finally{if(timer)clearTimeout(timer);}
}
