import {distance,legal,apply} from './engine.js';
const geometry=s=>JSON.stringify(s.walls.map(w=>[w.owner,w.o,w.x,w.y]).sort());
export function progressSnapshot(state,past){
 const turn=state.turn;
 return {...state,ownTurnHistory:past.filter(s=>s.turn===turn).slice(-12).map(s=>({
  square:s.p[turn].y*9+s.p[turn].x,otherSquare:s.p[1-turn].y*9+s.p[1-turn].x,
  distance:distance(s,turn),opponentDistance:distance(s,1-turn),geometry:geometry(s),left:[...s.left]
 }))};
}
// Diagnostic only: never remove a legal retreat or fabricate its tactical value.
// Reset the comparison at a changed maze; old distances are not comparable.
export function progressReview(state,action){
 const empty={active:false,windowTurns:0,reasons:[]};
 if(action?.type!=='move'||!legal(state,action))return empty;
 const next=apply(state,action);if(next.winner!==null)return empty;
 const maze=geometry(state),past=[];
 for(const row of [...(state.ownTurnHistory??[])].slice(-12).reverse()){
  if(row.geometry!==maze)break;
  if(!Number.isInteger(row.square)||row.square<0||row.square>80||!Number.isFinite(row.distance)||!Number.isFinite(row.opponentDistance))break;
  past.unshift(row);
 }
 const before=distance(state,state.turn),after=distance(next,state.turn),opponentNow=distance(state,1-state.turn);
 const square=action.y*9+action.x,best=Math.min(before,...past.map(r=>r.distance));
 const visit=past.findLastIndex(r=>r.square===square);
 const opponentProgress=past.length?past[0].opponentDistance-opponentNow:0;
 const cycleTurns=visit<0?null:past.length-visit+1;
 const reasons=[];
 if(visit>=0&&after>=best&&opponentProgress>0)reasons.push('return-without-progress');
 if(past.length&&after>before&&opponentProgress>0)reasons.push('retreat-while-opponent-advances');
 return {active:reasons.length>0,windowTurns:past.length,reasons,cycleTurns,before,after,bestDistance:best,
  opponentProgress,opponentNow,pawnContact:Math.abs(next.p[0].x-next.p[1].x)+Math.abs(next.p[0].y-next.p[1].y)<=1,
  // Compact evidence is stored with advice for subsequent loss analysis.
  path:past.map(r=>({square:r.square,distance:r.distance,opponentDistance:r.opponentDistance})),candidateSquare:square};
}
