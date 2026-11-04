import assert from'node:assert/strict';
import{readFileSync,writeFileSync}from'node:fs';
const read=n=>JSON.parse(readFileSync('evaluation/'+n+'.json','utf8'));
const report=read('sigma3-depth16-reply-margin-crosscheck');
const known=report.cases.find(x=>x.id===103);
assert.ok(known);
assert.equal(known.rootSide,0);
const [wall,move]=known.branches;
const get=(r,n)=>r.replyMilestones[String(n)];
assert.equal(get(wall,4).ownDist,8);
assert.equal(get(wall,4).opponentDist,13);
assert.equal(get(wall,12).ownDist,6);
assert.equal(get(wall,12).opponentDist,12);
assert.equal(get(wall,16).ownDist,13);
assert.equal(get(wall,16).opponentDist,12);
assert.equal(get(move,16).ownDist,10);
assert.equal(get(move,16).opponentDist,14);
const source=read('sigma3-fixture103-reply-depth16');
const w=source.branches[0].replies;
const before15=w.find(x=>x.plyAfterForced===14);
const at15=w.find(x=>x.plyAfterForced===15);
assert.equal(at15.side,1);
assert.deepEqual(at15.chosen,{type:'wall',x:2,y:0,o:'h'});
assert.equal(before15.distancesAfter[0],8);
assert.equal(at15.distancesAfter[0],14);
assert.equal(at15.distancesAfter[1],12);
const rows=report.cases.map(p=>{
 const [a,b]=p.branches;
 const winner=p.observedPreferredChoice;
 return{id:p.id,observedBetter:winner,deepPreferred:p.deterministic16PreferredChoice,
  matches: p.predictsObservedBetterChoice,
  baselineWinRate:a.observedWinRate,alternativeWinRate:b.observedWinRate,
  at4Margins:[a.replyMilestones['4'].margin,b.replyMilestones['4'].margin],
  at16Margins:[a.replyMilestones['16'].margin,b.replyMilestones['16'].margin],
  rootPathReversals:[a.replyMilestones['4'].margin>0&&a.replyMilestones['16'].margin<0,
                     b.replyMilestones['4'].margin>0&&b.replyMilestones['16'].margin<0]};
});
assert.equal(rows.filter(x=>x.matches).length,4);
assert.deepEqual(rows.filter(x=>!x.matches).map(x=>x.id),[27,29]);
const out={
 version:'sigma3-midgame-opponent-depth-safety-gate-v1',
 status:'offline-research-only',
 rootIds:rows.map(x=>x.id),
 cases:rows,
 keyFailure103:{
  rootSide:0,baselineFirstAction:source.branches[0].forcedAction,
  candidateAlternative:source.branches[1].forcedAction,
  after4:wall.replyMilestones['4'],
  after12:wall.replyMilestones['12'],
  decisiveReply:at15.chosen,
  ownDistanceIncreaseInOneReply:at15.distancesAfter[0]-before15.distancesAfter[0],
  after16Baseline:wall.replyMilestones['16'],
  after16Alternative:move.replyMilestones['16']
 },
 checks:{
  legalAndDeterministicReplays:true,
  observedBetterPredictions:4,
  totalEvaluatedPositions:6,
  contradictoryPositions:[27,29],
  independentModelWinGainDemonstrated:false,
  timeBudgetValidated:false,
  winRateTournamentPassed:false
 },
 promote:false,
 explanation:'16-ply PUCT-200 policy rollouts explain why the wall option in fixture 103 can fail late; the same margin rule errs on 27/29 and has no tournament proof. Do not modify sigma2 or sigma3.'
};
writeFileSync('evaluation/sigma3-midgame-opponent-depth-safety-gate.json',JSON.stringify(out,null,2));
console.log(JSON.stringify({status:out.status,case103:out.keyFailure103,
 matches:4,failures:[27,29],promote:false},null,2));
