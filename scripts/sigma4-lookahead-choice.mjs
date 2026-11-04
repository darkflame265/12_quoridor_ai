import {moves,validWall,apply,distance,legal} from '../src/engine.js';
import {chooseTacticalSigma4WithEmergency} from './sigma4-tactical-escape.mjs';
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function allActions(s){
 const a=moves(s);
 if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  const w={type:'wall',x,y,o};if(validWall(s,w))a.push(w);
 }
 return a;
}
function score(s,side){
 if(s.winner!==null)return s.winner===side?10000:-10000;
 const my=distance(s,side),opp=distance(s,1-side);
 return (opp-my)*12+(s.left[side]-s.left[1-side])*1.4;
}
const key=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
/**
 * Bounded zero-sum tactical minimax on real legal Quoridor moves and walls.
 * Evaluates opponent's best reply and our strongest response, not a full solved game.
 */
export function tacticalLookahead(state,side,{
 depth=3,branch=4,maxNodes=180,wallCandidates=8
}={}){
 let nodes=0,cache=new Map();
 function ranked(s,rootSide){
  const actions=allActions(s),cur=s.turn,arr=[];
  const own=distance(s,cur),opp=distance(s,1-cur);
  for(const a of actions){
   const n=apply(s,a),v=score(n,cur);
   const ownAfter=n.winner!==null?0:distance(n,cur),oppAfter=n.winner!==null?0:distance(n,1-cur);
   const improv=(own-ownAfter)+(oppAfter-opp);
   arr.push({a,n,rating:v+improv*2+(a.type==='wall'?-0.3:0)});
  }
  arr.sort((a,b)=>b.rating-a.rating);
  // preserve tactical diversity: pawn candidates, best strategically scored walls, and best total
  const chosen=[],taken=new Set();
  const add=x=>{if(x&&!taken.has(JSON.stringify(x.a))){chosen.push(x);taken.add(JSON.stringify(x.a));}};
  for(const x of arr.slice(0,branch))add(x);
  // Give a pawn racing response a chance even when walls dominate heuristic
  if(chosen.length>=branch&&chosen.every(x=>x.a.type==='wall')){
   const pawn=arr.find(x=>x.a.type==='move');if(pawn)chosen[chosen.length-1]=pawn;
  }
  return chosen.slice(0,branch);
 }
 function recurse(s,remain,alpha,beta){
  nodes++;
  if(s.winner!==null||remain===0||nodes>=maxNodes)return score(s,side);
  const k=key(s)+':'+remain;
  if(cache.has(k))return cache.get(k);
  const maximizing=s.turn===side;
  let best=maximizing?-Infinity:Infinity;
  const options=ranked(s,side);
  for(const opt of options){
   const v=recurse(opt.n,remain-1,alpha,beta);
   if(maximizing){best=Math.max(best,v);alpha=Math.max(alpha,best);}
   else{best=Math.min(best,v);beta=Math.min(beta,best);}
   if(alpha>=beta||nodes>=maxNodes)break;
  }
  if(!Number.isFinite(best))best=score(s,side);
  if(nodes<maxNodes)cache.set(k,best);
  return best;
 }
 function evaluate(action){
  if(!legal(state,action))throw Error('illegal lookahead root');
  const after=apply(state,action);
  const value=recurse(after,depth-1,-Infinity,Infinity);
  return {action,value};
 }
 return {evaluate,get nodes(){return nodes;},get exhausted(){return nodes>=maxNodes;}};
}
export function chooseLookaheadSigma4(state,search,rng,{
 rootLimit=3,depth=3,maxNodes=180,branch=4,
 riskGap=12,overrideMargin=15,maxQDrop=.1
}={}){
 const native=search?.pv?.[0];
 if(!native||!legal(state,native))throw Error('Sigma4 lookahead requires legal native');
 const tactical=chooseTacticalSigma4WithEmergency(state,search,rng,{rate:.56,maxQDrop:.08});
 if(['forced-immediate-win','avoid-next-turn-loss','exhaustive-immediate-loss-defense'].includes(tactical.reason))return {...tactical,searchReason:'tactical-override',lookaheadNodes:0};
 const root=(search.diagnostics?.rootChildren||[])
  .filter(c=>c.action&&legal(state,c.action)&&Number.isFinite(c.qFromRoot)&&c.visits>=6);
 const topQ=root.length?Math.max(...root.map(x=>x.qFromRoot)):0;
 const pool=[native];
 for(const r of root){
  if(pool.length>=rootLimit)break;
  if(topQ-r.qFromRoot>maxQDrop)continue;
  if(!pool.some(a=>same(a,r.action)))pool.push(r.action);
 }
 const searcher=tacticalLookahead(state,state.turn,{depth,maxNodes,branch});
 const graded=pool.map(a=>searcher.evaluate(a)).sort((a,b)=>b.value-a.value);
 const nativeGrade=graded.find(x=>same(x.action,native));
 const chosenGrade=graded.find(x=>same(x.action,tactical.action));
 if(searcher.exhausted)return {action:native,changed:false,reason:'bounded-search-budget-exhausted',lookaheadNodes:searcher.nodes,graded};
 // Always reject a tactic with substantially worse worst-case score than the native MCTS move
 if(chosenGrade&&nativeGrade&&chosenGrade.value>=nativeGrade.value-riskGap)
  return {...tactical,lookaheadNodes:searcher.nodes,graded,searchReason:'minimax-risk-screened'};
 const best=graded[0];
 if(best&&nativeGrade&&best.value>=nativeGrade.value+overrideMargin)
  return {action:best.action,changed:!same(best.action,native),reason:'minimax-strong-reply-upgrade',lookaheadNodes:searcher.nodes,graded};
 return {action:native,changed:false,reason:'minimax-native-fallback',lookaheadNodes:searcher.nodes,graded};
}
