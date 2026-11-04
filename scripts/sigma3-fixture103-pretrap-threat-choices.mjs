import{readFileSync,writeFileSync}from'node:fs';
import{SigmaProcess}from'../server/sigma-process.mjs';
import{clone,apply,legal,notation,distance}from'../src/engine.js';
import{directWallThreat}from'./sigma3-wall-threat-probe.mjs';
const id=103;
const root=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8')).find(r=>r.id===id);
const trace=JSON.parse(readFileSync('evaluation/sigma3-fixture103-reply-depth16.json','utf8')).branches[0];
let state=apply(clone(root.s),trace.forcedAction);
const history=[...root.history.slice(-47),clone(root.s)];
for(let n=0;n<13;n++){
 const step=trace.replies[n];if(!legal(state,step.chosen))throw Error('illegal replay '+n);
 history.push(clone(state));state=apply(state,step.chosen);
}
if(state.turn!==root.s.turn)throw Error('not defender turn');
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
const worker=new SigmaProcess({variant:'sigma2'});
let result;
try{result=await worker.search({...state,historyStates:history.slice(-48)});}
finally{await worker.close();}
const candidates=result.diagnostics?.rootChildren?.slice(0,8)||[];
const baseline=distance(state,root.s.turn);
const report={version:'sigma3-fixture103-pretrap-threat-choices-v1',
 originalPly:root.ply,followUpPly:14,
 state,baselineDistances:[distance(state,root.s.turn),distance(state,1-root.s.turn)],
 searchChosen:result.pv[0],originalReplayChosen:trace.replies[13].chosen,
 candidates:candidates.map(c=>{
  if(!legal(state,c.action))throw Error('bad candidate');
  const after=apply(state,c.action);
  const threat=directWallThreat(after,root.s.turn,{topK:5});
  return {action:c.action,notation:notation(c.action),visits:c.visits,qFromRoot:c.qFromRoot,
   ownDistanceAfter:distance(after,root.s.turn),
   opponentDistanceAfter:distance(after,1-root.s.turn),
   largestNextWallDamage:threat.maxOwnIncrease,
   largestNextNetDamage:threat.maxNetDamage,
   topThreats:threat.candidates.map(t=>({...t,notation:notation(t.action)}))};
 })};
writeFileSync('evaluation/sigma3-fixture103-pretrap-threat-choices.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({turn:state.turn,searchChosen:notation(result.pv[0]),
 replayChosen:notation(trace.replies[13].chosen),
 candidates:report.candidates.map(({notation,visits,qFromRoot,ownDistanceAfter,largestNextWallDamage,topThreats})=>({
 notation,visits,q:+qFromRoot.toFixed(3),ownDistanceAfter,largestNextWallDamage,
 worstWalls:topThreats.slice(0,2).map(x=>[x.notation,x.ownIncrease])}))},null,2));
