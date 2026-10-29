import {boardKey} from './screen-sync.js';
export function recommendation(state,result,{engine,ms,cores,build,ply}={}){
 if(!result.pv?.length)return null;
 return {kind:'recommendation',at:new Date().toISOString(),ply:ply??null,position:boardKey(state),turn:state.turn,engine,build:build??null,budgetMs:ms,cores,reportedEngine:result.engine??null,score:result.score??null,depth:result.depth??null,nodes:result.nodes??null,elapsedMs:result.elapsedMs??null,complete:result.done??result.complete??null,exact:result.exact??false,outcome:result.outcome??null,winProof:result.winProof?structuredClone(result.winProof):null,goalSafety:result.goalSafety?structuredClone(result.goalSafety):null,pv:structuredClone(result.pv)};
}
const sameAction=(a,b)=>!!a&&!!b&&a.type===b.type&&a.x===b.x&&a.y===b.y&&(a.type!=='wall'||a.o===b.o);
export function recordDecision(log,event){if(event){const last=log.at(-1);if(event.kind==='recommendation'&&last?.kind===event.kind&&last.position===event.position&&last.turn===event.turn&&last.engine===event.engine&&last.complete===event.complete&&sameAction(last.pv[0],event.pv[0]))log[log.length-1]=event;else log.push(event);if(log.length>1000)log.splice(0,log.length-1000);}}
export function observedAction(log,state,action,ply){
 const position=boardKey(state),advice=log.findLast(e=>e?.kind==='recommendation'&&e.position===position&&e.turn===state.turn&&e.pv?.[0]);
 const a=advice?.pv[0],matches=a?a.type===action.type&&a.x===action.x&&a.y===action.y&&(a.type!=='wall'||a.o===action.o):null;
 const earlier=log.findLast(e=>e?.kind==='recommendation'&&e.position===position&&e.turn===state.turn&&sameAction(e.pv?.[0],action));
 const latest=log.findLast(e=>e?.kind==='analysis-update'&&e.position===position&&e.turn===state.turn&&e.pv?.[0]);
 recordDecision(log,{kind:'action',at:new Date().toISOString(),position,turn:state.turn,ply,action:structuredClone(action),recommendationAt:advice?.at??null,matchesRecommendation:matches,earlierMatchingRecommendationAt:earlier?.at??null,latestAnalysisAt:latest?.at??null,matchesLatestAnalysis:latest?sameAction(latest.pv[0],action):null});
}
