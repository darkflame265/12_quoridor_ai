import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal,distance} from '../src/engine.js';
const read=path=>JSON.parse(readFileSync(path,'utf8'));
const reports=[
 {file:'evaluation/sigma4-sigma3-counterfactual-rollouts-20261105.json',collection:'late-critical'},
 {file:'evaluation/sigma4-sigma3-counterfactual-early-20261105.json',collection:'early-seed1'},
 {file:'evaluation/sigma4-sigma3-counterfactual-early-seed2-20261105.json',collection:'early-seed2'}
];
const summary=[],details=[];
for(const {file,collection} of reports){
 const d=read(file);
 assert.equal(d.tasks,d.games.length,'unfinished branch task '+file);
 for(const task of d.settings.scenarioMetadata){
  assert(task.recorded&&task.alternative);
  assert(task.positionHash&&task.prefixHash);
 }
 const groups=new Map();
 for(const g of d.games){
  assert(!g.cutoff,'continuation cutoff '+file);
  assert.notEqual(g.winner,null);
  assert(g.actions.length===g.finishedPlies);
  assert(g.candidateWon===(g.winner===g.candidateSide));
  let state=initial();
  for(let i=0;i<g.actions.length;i++){
   assert(legal(state,g.actions[i]),'illegal continuation '+file+' '+g.scenarioIndex+' '+i);
   state=apply(state,g.actions[i]);
  }
  assert.equal(state.winner,g.winner);
  const meta=d.settings.scenarioMetadata[g.scenarioIndex];
  assert.equal(g.branchPly,meta.ply);
  assert.deepEqual(g.actions[g.branchPly],g.branchAction);
  assert.equal(g.actions.length-g.branchPly-1,g.continuationPlies);
  const key=String(g.scenarioIndex)+'/'+String(g.seed);
  if(!groups.has(key))groups.set(key,[]);
  groups.get(key).push(g);
 }
 for(const [key,group] of groups){
  assert.equal(group.length,2,'missing paired comparison '+file+' '+key);
  const recorded=group.find(g=>g.variant==='recorded');
  const alt=group.find(g=>g.variant!=='recorded');
  assert(recorded&&alt);
  assert.equal(recorded.fixture,alt.fixture);
  assert.equal(recorded.candidateSide,alt.candidateSide);
  assert.equal(recorded.seed,alt.seed);
  assert.notDeepEqual(recorded.branchAction,alt.branchAction);
  assert.deepEqual(recorded.actions.slice(0,recorded.branchPly),alt.actions.slice(0,alt.branchPly));
  details.push({collection,fixture:recorded.fixture,ply:recorded.branchPly,seed:recorded.seed,
   recordedAction:recorded.branchAction,alternativeAction:alt.branchAction,
   recordedWin:recorded.candidateWon,alternativeWin:alt.candidateWon,
   recordedTotalPlies:recorded.finishedPlies,alternativeTotalPlies:alt.finishedPlies,
   recordedContinuation:recorded.continuationPlies,alternativeContinuation:alt.continuationPlies,
   improved:alt.candidateWon&&!recorded.candidateWon,regressed:!alt.candidateWon&&recorded.candidateWon});
 }
 summary.push({collection,games:d.games.length,pairs:groups.size,fullyPlayed:true});
}
const verdict={
 version:'sigma4-counterfactual-branch-verdict-v1',
 scope:'200-simulation Sigma3-bitset weighted candidate vs deterministic native Sigma3, fixed recorded prefix and independently seeded continuation',
 summary,
 pairedResults:details,
 totals:{games:summary.reduce((n,x)=>n+x.games,0),pairs:details.length,
  alternativeImprovedWins:details.filter(x=>x.improved).length,
  alternativeRegressedWins:details.filter(x=>x.regressed).length,
  tiesInWinOutcome:details.filter(x=>x.recordedWin===x.alternativeWin).length},
 interpretation:'Follow-up RNG is reinitialized at each branch; recorded branch is a controlled counterfactual baseline and may not reproduce the historical trajectory. Results are correlated by scenario; not an unbiased win-rate experiment.',
 promotionGates:{
 legalCompleteContinuations:true,
 pairedPrefixIdentical:true,
 demonstratedNewStrengthGain:false,
 crossFixtureBlindValidation:false,
 productionPromotionApproved:false
 },
 decision:'No sampled alternative improved final win outcome. Do not replace current Sigma4 root-selection or add a shortcut favoring path-distance-only pawn moves.'
};
assert.equal(verdict.totals.games,16);
assert.equal(verdict.totals.pairs,8);
assert.equal(verdict.totals.alternativeImprovedWins,0);
writeFileSync('evaluation/sigma4-sigma3-counterfactual-verdict-20261105.json',JSON.stringify(verdict,null,2)+'\n');
console.log('PASS COUNTERFACTUAL AUDIT',JSON.stringify(verdict.totals),JSON.stringify(verdict.summary));
