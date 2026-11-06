import assert from 'node:assert/strict';
import {initial,apply,legal,moves} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedTacticalV3} from './sigma4-weighted-tactical-v3.mjs';
const d=JSON.parse((await import('node:fs')).readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8'));
const game=d.games[20],fixture=d.fixtures.find(x=>x.id===game.fixture);
let s=initial();
for(const a of fixture.actions)s=apply(s,a);
for(const t of game.trace){
 if(t.ply===44){
  const search={pv:[t.baseAction],diagnostics:{rootChildren:t.rootChildren}};
  let first=chooseWeightedResearchCandidate(s,search,(arr=>()=>arr.shift()??.99)([0,.99]),{rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06});
  assert.deepEqual(first.action,t.action,'test should recreate the dangerous sample');
  const guarded=chooseWeightedTacticalV3(s,search,(arr=>()=>arr.shift()??.99)([0,.99]));
  assert.equal(guarded.reason,'prevent-immediate-opponent-goal');
  assert.deepEqual(guarded.action,t.baseAction);
  assert.ok(legal(s,guarded.action));
  const after=apply(s,guarded.action);
  assert.ok(moves(after).every(a=>apply(after,a).winner!==after.turn));
  console.log('PASS Sigma4 weighted-v3 prevents actual lost game 20 ply 44 goal-in-one exposure');
  break;
 }
 s=apply(s,t.action);
}
const fresh=initial(),a=moves(fresh)[0];
const basic=chooseWeightedTacticalV3(fresh,{pv:[a],diagnostics:{rootChildren:[{action:a,visits:200,qFromRoot:.1}]}},()=>0);
assert.ok(legal(fresh,basic.action));

const threat={...initial(),p:[{x:4,y:5},{x:4,y:7}],turn:0};
const unsafe={type:'move',x:4,y:4};
const rescued=chooseWeightedTacticalV3(threat,{pv:[unsafe],diagnostics:{rootChildren:[{action:unsafe,visits:200,qFromRoot:.1}]}},()=>0);
assert.equal(rescued.reason,'exhaustive-immediate-goal-defense');
assert.ok(legal(threat,rescued.action));
const defended=apply(threat,rescued.action);
assert.ok(moves(defended).every(a=>apply(defended,a).winner!==defended.turn));
console.log('PASS Sigma4 v3 exhaustive legal emergency defense');
