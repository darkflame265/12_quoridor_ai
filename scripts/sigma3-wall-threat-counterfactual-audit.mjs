import assert from 'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
import{clone,apply,legal,distance,notation,initial}from'../src/engine.js';
import{directWallThreat,unansweredTwoWallThreat}from'./sigma3-wall-threat-probe.mjs';
const roots=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8'));
const cases=[101,103,105];
const results=[];
for(const id of cases){
 const root=roots.find(x=>x.id===id);
 const report=JSON.parse(readFileSync('evaluation/sigma3-fixture'+id+'-reply-depth16.json','utf8'));
 const branches=[];
 for(const branch of report.branches){
  let s=apply(clone(root.s),branch.forcedAction),t0=performance.now();
  const immediate=directWallThreat(s,root.s.turn,{topK:8});
  const paired=unansweredTwoWallThreat(s,root.s.turn,{topK:6,secondTopK:3});
  const ms=Math.round(performance.now()-t0);
  const afterForced={maxSingle:immediate.maxOwnIncrease,maxNet:immediate.maxNetDamage,
   twoWall:paired.unansweredTwoWall,timingMs:ms};
  for(let i=0;i<14;i++){
   const r=branch.replies[i];assert.ok(legal(s,r.chosen),'illegal reply '+id+':'+i);
   s=apply(s,r.chosen);
  }
  let critical=null;
  if(id===103&&branch.choice===0){
   const before=directWallThreat(s,root.s.turn,{topK:128});
   const recorded=branch.replies[14];
   assert.equal(recorded.side,1);
   assert.ok(legal(s,recorded.chosen));
   const beforeOwn=distance(s,0);
   const after=apply(s,recorded.chosen);
   assert.equal(distance(after,0)-beforeOwn,6);
   const found=before.candidates.find(c=>JSON.stringify(c.action)===JSON.stringify(recorded.chosen));
   assert.ok(found,'expected c1 horizontal wall in threat search');
   assert.equal(found.ownIncrease,6);
   critical={beforeDistances:before.baselineDistances,beforeMax:before.maxOwnIncrease,
    decisiveWall:notation(recorded.chosen),decisiveWallDamage:found.ownIncrease,
    criticalWallRank:before.candidates.findIndex(c=>JSON.stringify(c.action)===JSON.stringify(recorded.chosen))+1,
    potentialWalls:before.legalDamageWalls,attackerToMove:s.turn===1-root.s.turn};
  }
  branches.push({choice:branch.choice,action:branch.forcedAction,
    afterForced,critical,after16Distances:branch.stateAfter16Plies.distances});
 }
 results.push({id,rootTurn:root.s.turn,branches});
}
const start=initial();
assert.equal(directWallThreat(start,0).maxOwnIncrease>=0,true);
const empty=clone(start);empty.left[1]=0;
assert.equal(directWallThreat(empty,0).maxOwnIncrease,0);
assert.equal(unansweredTwoWallThreat(empty,0).unansweredTwoWall,null);
const report={version:'sigma3-wall-threat-counterfactual-audit-v1',
 cases:results,method:'Enumerate all legal single opponent walls at a fixed state; evaluate BFS distance increases. Two-wall probe tests bounded follow-up walls without defender responses.',
 status:'research-only',productionChanged:false,
 risks:['Single-wall scan does not know whether the opponent prefers or can profitably choose the attack.',
 'Two-wall probe skips first walls with zero immediate own-distance damage and only explores top choices, so is not an exhaustive maximum.',
 'Two consecutive opponent wall placements ignore a responding move and are not legal consecutive turns.',
 'Forcing threat-avoidance without checking strategic winning paths can weaken Sigma3.']};
writeFileSync('evaluation/sigma3-wall-threat-counterfactual-audit.json',JSON.stringify(report,null,2));
console.log(JSON.stringify(results.map(r=>({id:r.id,branches:r.branches.map(b=>({choice:b.choice,
 maxSingle:b.afterForced.maxSingle,maxNet:b.afterForced.maxNet,
 twoWall:b.afterForced.twoWall?.ownIncrease,ms:b.afterForced.timingMs,
 after16:b.after16Distances,critical:b.critical}))})),null,2));
