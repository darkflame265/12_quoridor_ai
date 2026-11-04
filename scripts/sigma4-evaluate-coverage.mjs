import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const files=[
 {file:'evaluation/sigma4-research-games.json',matchup:'sigma3-vs-sigma2',batch:'pilot'},
 {file:'evaluation/sigma4-research-extended-games.json',matchup:'sigma3-vs-sigma2',batch:'extended'},
 {file:'evaluation/sigma4-selfplay-games.json',matchup:'sigma3-vs-sigma3',batch:'selfplay'}
];
const sets=[],fullSequenceHashes=new Set(),fullStates=new Set(),uniqueByPhase={early:new Set(),middle:new Set(),late:new Set()};
const allOpeningHashes=new Set(),gameHashes=[];
let recorded=0,duplicates=0,totalStates=0,alternativeEvidence=0,searchDisagreements=0,unfinished=0;
for(const spec of files){
 const doc=JSON.parse(readFileSync(spec.file,'utf8'));
 assert.ok(doc.games.length>0);
 let localUnique=new Set();
 for(const game of doc.games){
  recorded++;
  if(fullSequenceHashes.has(game.sequenceHash))duplicates++;else fullSequenceHashes.add(game.sequenceHash);
  localUnique.add(game.sequenceHash);gameHashes.push(game.sequenceHash);
  allOpeningHashes.add(game.openingHash);
  if(game.cutoff)unfinished++;
  for(const t of game.trace){
   const state=JSON.stringify([t.state.p,t.state.walls,t.state.left,t.state.turn]);
   fullStates.add(state);totalStates++;
   const category=t.ply<20?'early':t.ply<60?'middle':'late';
   uniqueByPhase[category].add(state);
   if(t.disagreement)searchDisagreements++;
   if(t.rootCandidates?.length>=2)alternativeEvidence++;
  }
 }
 sets.push({...spec,games:doc.games.length,uniqueSequences:localUnique.size,duplicatesInBatch:doc.games.length-localUnique.size,openingFamilies:new Set(doc.games.map(x=>x.openingHash)).size,
  cutoffs:doc.games.filter(x=>x.cutoff).length});
}
const report={version:'sigma4-diversity-coverage-v1',sourceFiles:files.map(x=>x.file),sets,
 totalGames:recorded,uniqueWholeGameSequences:fullSequenceHashes.size,duplicateSequences:duplicates,
 uniqueOpeningFamilies:allOpeningHashes.size,totalRecordedDecisionStates:totalStates,
 uniqueDecisionStates:fullStates.size,uniqueByPhase:Object.fromEntries(Object.entries(uniqueByPhase).map(([k,v])=>[k,v.size])),
 positionsWithAtLeastTwoMctsCandidates:alternativeEvidence,chosenVsSearchLeaderDisagreements:searchDisagreements,
 cutoffs:unfinished,gates:{allGamesFinished:unfinished===0,diverseSamples:fullSequenceHashes.size>=Math.ceil(recorded*.8),
 sufficientlyLargeForNewModel:allOpeningHashes.size>=40&&fullStates.size>=2000,
 trueOutOfDistributionHoldout:false},
 caveats:['The opening prefix is deliberately controlled; win rate is not an unbiased Elo rating',
 'Sigma3-vs-Sigma3 self-play does not supply a Sigma2 baseline win rate',
 'State diversity does not imply independent value labels','Uncommitted baseline worker changes are fingerprinted separately in sigma4-research-gate.json']};
writeFileSync('evaluation/sigma4-diversity-coverage.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({games:report.totalGames,uniqueSequences:report.uniqueWholeGameSequences,openingFamilies:report.uniqueOpeningFamilies,uniqueStates:report.uniqueDecisionStates,
 phase:report.uniqueByPhase,batches:report.sets.map(x=>({batch:x.batch,games:x.games,unique:x.uniqueSequences}))},null,2));
