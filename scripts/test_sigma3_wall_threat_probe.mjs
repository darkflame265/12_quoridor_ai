import assert from'node:assert/strict';
import{readFileSync}from'node:fs';
import{clone,apply,distance,initial,legal,validWall}from'../src/engine.js';
import{directWallThreat,unansweredTwoWallThreat}from'./sigma3-wall-threat-probe.mjs';
const roots=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8'));
const root=roots.find(x=>x.id===103);
const branch=JSON.parse(readFileSync('evaluation/sigma3-fixture103-reply-depth16.json','utf8')).branches[0];
let state=apply(clone(root.s),branch.forcedAction);
for(let i=0;i<14;i++){
 const step=branch.replies[i];
 assert.ok(legal(state,step.chosen),'illegal setup move '+i);
 state=apply(state,step.chosen);
}
const key=JSON.stringify(state),side=root.s.turn;
const danger=directWallThreat(state,side,{topK:128});
assert.equal(danger.baselineDistances[0],8);
assert.equal(danger.maxOwnIncrease,6);
assert.ok(danger.candidates.every(w=>w.ownIncrease>0&&
   w.netDamage===w.ownIncrease-w.enemyIncrease));
const decisive={type:'wall',x:2,y:0,o:'h'};
const selected=danger.candidates.find(x=>JSON.stringify(x.action)===JSON.stringify(decisive));
assert.ok(selected);
assert.equal(selected.ownIncrease,6);
assert.equal(JSON.stringify(state),key,'risk scan must not mutate input');
for(const d of danger.candidates)assert.ok(validWall({...state,turn:1-side},d.action));
const double=unansweredTwoWallThreat(state,side,{topK:6,secondTopK:3});
assert.ok(double.unansweredTwoWall||state.left[1-side]<2);
if(double.unansweredTwoWall)assert.ok(double.unansweredTwoWall.ownIncrease>=0);
const noWalls=clone(state);noWalls.left[1-side]=0;
assert.equal(directWallThreat(noWalls,side).maxOwnIncrease,0);
assert.equal(unansweredTwoWallThreat(noWalls,side).unansweredTwoWall,null);
assert.equal(directWallThreat(initial(),0).maxOwnIncrease>=0,true);
console.log('PASS 103 decisive wall +6, legal wall scan, no mutation, optional two-wall probe');
