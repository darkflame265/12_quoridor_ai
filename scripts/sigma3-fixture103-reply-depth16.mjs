import{readFileSync,writeFileSync}from'node:fs';
import{SigmaProcess}from'../server/sigma-process.mjs';
import{clone,apply,legal,distance}from'../src/engine.js';
const roots=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8'));
const root=roots.find(r=>r.id===103);
const result={version:'sigma3-fixture103-reply-depth-v1',
rootId:103,originalPly:root.ply,originalMcts:root.rootCandidates.slice(0,2),
conditions:{sims:200,variant:'sigma2',deterministic:true,reuse:false,stepsAfterForced:16},
branches:[]};
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
process.env.SIGMA_DIAGNOSTICS='1';
async function run(choice){
 const forced=root.rootCandidates[choice].action;
 let state=apply(clone(root.s),forced);
 let history=[...root.history.slice(-47),clone(root.s)];
 const record={choice,forcedAction:forced,rootDistances:[distance(root.s,0),distance(root.s,1)],
 initialAfterForced:{p:state.p,left:state.left,distances:[distance(state,0),distance(state,1)],walls:state.walls.length},
 replies:[]};
 const workers=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 try{
  for(let i=0;i<16&&state.winner===null;i++){
   const r=await workers[state.turn].search({...state,historyStates:history.slice(-48)});
   if(!legal(state,r.pv[0]))throw Error('illegal reply '+choice+' '+i);
   const before=clone(state);
   history.push(before);
   state=apply(state,r.pv[0]);
   record.replies.push({
    plyAfterForced:i+1,side:before.turn,chosen:r.pv[0],q:r.value,
    rootChildren:r.diagnostics?.rootChildren?.slice(0,4),
    distancesBefore:[distance(before,0),distance(before,1)],
    distancesAfter:[distance(state,0),distance(state,1)],
    pawnPositions:state.p,remainingWalls:state.left,
    winner:state.winner
   });
  }
  record.stateAfter16Plies={p:state.p,walls:state.walls,left:state.left,turn:state.turn,winner:state.winner,
   distances:[distance(state,0),distance(state,1)]};
  return record;
 }finally{await Promise.all(workers.map(w=>w.close()))}
}
result.branches=await Promise.all([run(0),run(1)]);
writeFileSync('evaluation/sigma3-fixture103-reply-depth16.json',JSON.stringify(result,null,2));
for(const branch of result.branches){
 console.log('BRANCH',branch.choice,JSON.stringify(branch.forcedAction),
  'initial',branch.initialAfterForced,
  'replies',branch.replies.map(r=>({n:r.plyAfterForced,side:r.side,
    action:r.chosen,d:r.distancesAfter,rootTop:r.rootChildren?.slice(0,2).map(x=>[x.visits,x.qFromRoot])})),
  'after16',branch.stateAfter16Plies.distances);
}
