import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
const loaded=p=>JSON.parse(readFileSync(p,'utf8'));
const branch=loaded('evaluation/sigma4-strong-reply-counterfactual.json');
const duel=loaded('evaluation/sigma4-vs-sigma3-pilot.json');
const mined=loaded('evaluation/sigma4-weighted-mined.json');
const data=loaded('evaluation/sigma4-natural-weighted-games.json');
const ids=[...new Set(branch.results.map(x=>x.id))];
const srcRows=new Map(mined.train.map(x=>[x.id,x]));
const rootComparisons=[];
for(const id of ids){
 const root=srcRows.get(id);assert.ok(root&&root.split==='train');
 const pairs=[];
 for(const seed of branch.settings.seeds){
  const samples=branch.results.filter(x=>x.id===id&&x.seed===seed).sort((x,y)=>x.choice-y.choice);
  assert.equal(samples.length,2,'must be exactly two forced actions per seed');
  assert.deepEqual(samples.map(x=>x.choice),[0,1]);
  assert.ok(samples.every(x=>!x.cutoff&&x.rootKey===root.stateKey));
  assert.deepEqual(samples[0].forcedAction,root.originalAction);
  assert.deepEqual(samples[1].forcedAction,root.alternatives[0].action);
  assert.ok(samples.every(x=>legal(root.rootState,x.forcedAction)));
  pairs.push({seed,originalWon:samples[0].rootWon,alternativeWon:samples[1].rootWon,
   gain:Number(samples[1].rootWon)-Number(samples[0].rootWon),
   sameContinuation:samples[0].uniqueHash===samples[1].uniqueHash});
 }
 rootComparisons.push({id,sourceSeed:root.sourceSeed,originalNotation:root.originalNotation,
  alternativeNotation:root.alternatives[0].notation,
  matchedSeeds:pairs.length,improvements:pairs.filter(x=>x.gain>0).length,
  regressions:pairs.filter(x=>x.gain<0).length,
  ties:pairs.filter(x=>x.gain===0).length,pairs});
}
const allPositions=new Set(),experimentalMoves=[];let nativeMoves=0;
for(const g of duel.games){
 assert.equal(g.match,'candidate-vs-sigma3');
 assert.ok(g.winner===0||g.winner===1);
 assert.equal(g.cutoff,false);
 assert.equal(g.plies,g.trace.length);
 let s=initial();
 for(const t of g.trace){
  assert.equal(JSON.stringify(s),JSON.stringify(t.state));
  assert.ok(legal(s,t.action));
  if(t.side===g.sigma3Side)experimentalMoves.push(t.action);
  else nativeMoves++;
  allPositions.add(JSON.stringify([s.p,s.walls,s.left,s.turn]));
  s=apply(s,t.action);
 }
 assert.equal(s.winner,g.winner);
 assert.equal(g.candidateWon,g.winner===g.sigma3Side);
}
const openingGroups=[...new Set(duel.games.map(g=>g.seed))];
assert.equal(duel.games.length,openingGroups.length*2);
for(const seed of openingGroups)assert.deepEqual(duel.games.filter(x=>x.seed===seed).map(x=>x.sigma3Side).sort(),[0,1]);
const wins=duel.games.filter(g=>g.candidateWon).length;
const result={version:'sigma4-strong-reply-and-direct-pilot-gate-v1',
 strongReply:{games:branch.results.length,roots:rootComparisons,
  seeds:branch.settings.seeds,reuse:branch.settings.reuse,followupMethod:branch.settings.followupMethod},
 directSigma3Pilot:{games:duel.games.length,candidateWins:wins,candidateLosses:duel.games.length-wins,
  candidateFirstWins:duel.games.filter(g=>g.sigma3Side===0&&g.candidateWon).length,
  candidateSecondWins:duel.games.filter(g=>g.sigma3Side===1&&g.candidateWon).length,
  distinctFullSequences:new Set(duel.games.map(g=>g.sequenceHash)).size,
  distinctFirstSix:new Set(duel.games.map(g=>g.firstSixHash)).size,
  distinctDecisionStates:allPositions.size,experimentalMoves:experimentalMoves.length,
  nativeMoves,seedCount:openingGroups.length},
 gates:{fullyVerifiedGameReplay:true,splitTrainAndHeldoutStates:new Set(mined.train.map(x=>x.stateKey)).size===mined.train.length,
 atLeast5IndependentRoots:rootComparisons.length>=5,
 atLeast5SeedsPerRoot:rootComparisons.every(r=>r.matchedSeeds>=5),
 robustVerifiedGain:rootComparisons.some(r=>r.improvements>=4&&r.regressions===0&&r.matchedSeeds>=5),
 atLeast20PairedDuelGames:duel.games.length>=20,
 significantOutOfSampleGain:false},
 status:'research-only',modelTraining:false,promote:false,
 explanation:'Small matched branches and direct 4-game pilot cannot establish superiority; keep production engines unchanged'};
writeFileSync('evaluation/sigma4-strong-reply-direct-gate.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({strongReply:rootComparisons.map(({pairs,...r})=>r),direct:result.directSigma3Pilot,promote:false},null,2));
