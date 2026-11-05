import {apply,distance,legal,moves} from '../src/engine.js';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
const eq=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const unsafe=(s,a)=>{const n=apply(s,a);return n.winner===null&&moves(n).some(b=>apply(n,b).winner===n.turn);};
export async function chooseWeightedReplyV5(state,search,rng,replySearch,opts={}){
 const result=chooseWeightedTacticalV3(state,search,rng,opts),native=search?.pv?.[0];
 if(!native||!legal(state,native)||!legal(state,result.action)||eq(native,result.action)||result.reason!=='visit-and-q-weighted')return {...result,replyGate:'skipped'};
 if(unsafe(state,native))return {...result,replyGate:'native-unsafe'};
 const own=state.turn,enemy=1-own;
 const evaluate=async action=>{
  const s=apply(state,action);
  if(s.winner===own)return {score:1000,reply:null};
  const reply=(await replySearch(s))?.pv?.[0];
  if(!reply||!legal(s,reply))throw Error('invalid opponent reply');
  const f=apply(s,reply);
  if(f.winner===enemy)return {score:-1000,reply};
  return {score:distance(f,enemy)-distance(f,own)+0.35*(f.left[own]-f.left[enemy]),reply};
 };
 try{
  const [weighted,nativeResult]=await Promise.all([evaluate(result.action),evaluate(native)]);
  if(nativeResult.score-weighted.score>=Number(opts.replyMargin??2))
   return {action:native,changed:false,reason:'reply-search-risk-gate',weighted,nativeResult};
  return {...result,replyGate:'compared',weighted,nativeResult};
 }catch(e){return {...result,replyGate:'unavailable',replyError:String(e?.message??e)};}
}
