import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
import {initial,legal,apply,distance,notation} from '../src/engine.js';
const prior=JSON.parse(readFileSync('evaluation/sigma4-vs-sigma3-expanded.json'));
const holdoutPath='evaluation/sigma4-vs-sigma3-holdout.json';
if(!existsSync(holdoutPath))throw Error('Holdout games not yet started');
const holdout=JSON.parse(readFileSync(holdoutPath));
const priorSeeds=new Set(prior.games.map(g=>g.seed));
assert.ok(holdout.games.every(g=>!priorSeeds.has(g.seed)),'overlapping holdout seed');
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const key=s=>sha([s.p,s.walls.map(w=>[w.x,w.y,w.o]).sort(),s.left,s.turn]);
const firstCandidateDeviations=[],losses=[],allStates=new Set(),candidateStates=new Set();
for(const g of holdout.games){
 if(g.candidateWon)continue;
 const candidateSteps=g.trace.filter(t=>t.side===g.sigma3Side);
 const changed=[];
 for(const t of candidateSteps){
  const first=t.rootCandidates?.[0];
  const isDifference=first?.action&&JSON.stringify(first.action)!==JSON.stringify(t.action);
  const previous=t.pathsBefore,next=t.pathsAfter;
  const side=t.side,opp=1-side;
  const relativeDelta=(next?.[side]-previous?.[side])-(next?.[opp]-previous?.[opp]);
  if(isDifference)changed.push({
   ply:t.ply,chosen:t.chosenNotation,
   leader:notation(first.action),leaderVisits:first.visits,leaderQ:first.qFromRoot,
   candidateDiagnostics:t.rootCandidates.slice(0,4).map(x=>({a:notation(x.action),visits:x.visits,Q:x.qFromRoot})),
   relativePathDelta:relativeDelta,wall:t.action.type==='wall',stateHash:key(t.state)});
 }
 if(changed.length){
  const first=changed[0];firstCandidateDeviations.push({seed:g.seed,side:g.sigma3Side,...first});
 }
 losses.push({seed:g.seed,side:g.sigma3Side,plies:g.plies,
  candidateModifications:g.overrides,firstDeviation:changed[0]??null,
  changes:changed.slice(0,10),winner:g.winner,sequenceHash:g.sequenceHash,
  earlyPrefixHash:g.firstSixHash});
}
for(const g of holdout.games)for(const t of g.trace){
 const k=key(t.state);allStates.add(k);
 if(t.side===g.sigma3Side)candidateStates.add(k);
}
const oldStates=new Set();
for(const g of prior.games)for(const t of g.trace)oldStates.add(key(t.state));
const overlap=[...candidateStates].filter(k=>oldStates.has(k)).length;
const report={version:'sigma4-holdout-loss-diagnostic-v1',status:holdout.games.length===holdout.planned?'complete':'partial',
 priorGames:prior.games.length,holdoutGames:holdout.games.length,completedLosses:losses.length,
 uniqueHoldoutGames:new Set(holdout.games.map(g=>g.sequenceHash)).size,
 uniqueHoldoutStates:allStates.size,overlapCandidateStatesWithPrior:overlap,
 holdoutNovelCandidateStates:candidateStates.size-overlap,
 losses,earlyDivergenceCount:firstCandidateDeviations.filter(x=>x.ply<20).length,
 firstCandidateDeviations,
 cautions:['MCTS root-visit disagreement is NOT proof that a choice caused the loss',
  'Changing one move affects the entire downstream trajectory; stronger counterfactual rollouts required',
  'State overlap across prior and holdout should not be used to train or tune the frozen candidate']};
writeFileSync('evaluation/sigma4-holdout-loss-diagnostic.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,holdoutGames:report.holdoutGames,completedLosses:report.completedLosses,
 uniqueSequences:report.uniqueHoldoutGames,novelCandidateStates:report.holdoutNovelCandidateStates,
 overlap:report.overlapCandidateStatesWithPrior,earlyDivergenceCount:report.earlyDivergenceCount,
 firstCandidateDeviations:report.firstCandidateDeviations.slice(0,5).map(({candidateDiagnostics,...x})=>x)},null,2));
