import {initial,apply,legal} from '../src/engine.js';
import {Position,solveEndgame} from '../src/search.js';

export const actionKey=a=>JSON.stringify([a.type,a.x,a.y,a.o??null]);
export const positionKey=s=>JSON.stringify([s.p,s.left,s.turn,s.walls.map(w=>[w.x,w.y,w.o]).sort()]);

export function reconstructLoss(game,source){
 if(!Array.isArray(game.records)||!Array.isArray(game.trace)||!Number.isInteger(game.openingPlies)||game.openingPlies<0||game.records.length!==game.openingPlies+game.trace.length)throw Error('Invalid archived trace');
 let state=initial();const positions=[];
 for(const [ply,action] of game.records.entries()){
  if(!legal(state,action))throw Error('Illegal archived action');
  if(ply>=game.openingPlies){const trace=game.trace[ply-game.openingPlies];if(actionKey(trace.action)!==actionKey(action)||trace.turn!==state.turn||trace.ply!==ply)throw Error('Archived trace disagrees with replay');
   if(state.turn===game.candidateSide)positions.push({source,ply,state:structuredClone(state),records:game.records.slice(0,ply),played:action,suite:source.suite});
  }state=apply(state,action);
 }
 if(state.winner!==game.winner||game.result!==(state.winner===null?'draw':state.winner===game.candidateSide?'win':'loss'))throw Error('Archived result mismatch');
 return game.result==='loss'?positions:[];
}

export function sampleLosses(positions,limit){
 const unique=[...new Map(positions.map(p=>[positionKey(p.state),p])).values()],out=[],used=new Set();
 const add=p=>{if(p&&!used.has(positionKey(p.state))&&out.length<limit){out.push(p);used.add(positionKey(p.state));}};
 // Keep exact endings, last-wall decisions, and wall-rich middlegames represented.
 for(const suite of ['general','maze']){
  const group=unique.filter(p=>p.suite===suite);
  add(group.find(p=>p.state.left[0]+p.state.left[1]===0));
  add(group.find(p=>p.state.left[0]+p.state.left[1]===1));
  add(group.filter(p=>p.state.walls.length>=8&&p.state.left[0]+p.state.left[1]>1).sort((a,b)=>Math.abs(a.state.left[0]+a.state.left[1]-6)-Math.abs(b.state.left[0]+b.state.left[1]-6))[0]);
 }
 const grouped=Object.groupBy(unique,p=>p.source.file),lists=Object.values(grouped);
 for(let i=0;out.length<Math.min(limit,unique.length);i++)for(const list of lists)add(list[Math.floor((i*.38196601125%1)*list.length)]);
 return out;
}

export function geometry(state,action){
 const t=state.turn,p=new Position(state),before={own:p.distances(t),opponent:p.distances(1-t)},next=apply(state,action),q=new Position(next);
 return {before,after:{own:q.distances(t),opponent:q.distances(1-t)},wallsLeft:state.left,wallCount:state.walls.length};
}

export function exactOutcome(state){
 if(state.winner!==null)return {outcome:state.winner===state.turn?1:-1,distance:0};
 if(state.left.some(n=>n!==0))return null;
 const table=solveEndgame(state);return table.lookup(state.p[0].y*9+state.p[0].x,state.p[1].y*9+state.p[1].x,state.turn);
}

export function classify(item){
 const same=actionKey(item.short.pv[0])===actionKey(item.long.pv[0]);
 const exactLoss=item.shortBranch.exactOutcome!==null&&(item.exactRoot!==null&&item.shortBranch.exactOutcome<item.exactRoot.outcome||item.longBranch.exactOutcome!==null&&item.shortBranch.exactOutcome<item.longBranch.exactOutcome);
 const gap=item.longBranch.score-item.shortBranch.score;
 return {exactLoss,actionChanged:!same,shortStable:actionKey(item.short.pv[0])===actionKey(item.repeat.pv[0]),heuristicGap:gap,review:exactLoss?'proven-ending-loss':!same&&gap>=50?'search-sensitive-gap':!same?'alternative-action':'consistent',proven:exactLoss,warning:'Longer selective search and score gaps are diagnostic references, not proofs of optimal play.'};
}
