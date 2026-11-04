import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const prior=JSON.parse(readFileSync('evaluation/sigma4-vs-sigma3-expanded.json'));
const hold=JSON.parse(readFileSync('evaluation/sigma4-vs-sigma3-holdout.json'));
const sig=o=>JSON.stringify([o.p,o.walls,o.left,o.turn,o.winner]);
const shasum=p=>createHash('sha256').update(readFileSync(p)).digest('hex');
const stats=games=>{
 const wins=games.filter(g=>g.candidateWon).length;
 const n=games.length,z=1.96,p=wins/n,den=1+z*z/n;
 const center=(p+z*z/(2*n))/den,margin=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return {games:n,wins,losses:n-wins,winRate:p,wilson95:[Math.max(0,center-margin),Math.min(1,center+margin)],
 firstWins:games.filter(g=>g.sigma3Side===0&&g.candidateWon).length,
 secondWins:games.filter(g=>g.sigma3Side===1&&g.candidateWon).length,
 uniqueSequences:new Set(games.map(g=>g.sequenceHash)).size,
 uniqueFirstSix:new Set(games.map(g=>g.firstSixHash)).size,
 cutoffs:games.filter(g=>g.cutoff).length};
};
const seenTask=new Set(),seeds=[...new Set(hold.games.map(g=>g.seed))],pairs=[];
assert.equal(hold.games.length,hold.planned);
assert.equal(new Set(prior.games.map(g=>g.seed)).size,6);
assert.ok(seeds.every(seed=>!prior.settings.seedList.includes(seed)));
for(const seed of seeds){
 const games=hold.games.filter(g=>g.seed===seed).sort((a,b)=>a.sigma3Side-b.sigma3Side);
 assert.equal(games.length,2);
 assert.deepEqual(games.map(g=>g.sigma3Side),[0,1]);
 pairs.push({seed,candidateFirstWon:games[0].candidateWon,candidateSecondWon:games[1].candidateWon,
   wins:games.filter(g=>g.candidateWon).length,distinctSequences:new Set(games.map(g=>g.sequenceHash)).size});
}
for(const game of hold.games){
 assert.ok(!seenTask.has(game.seed+'-'+game.sigma3Side));seenTask.add(game.seed+'-'+game.sigma3Side);
 assert.equal(game.openingPrefix.length,0);assert.equal(game.plies,game.trace.length);
 let state=initial();
 for(const step of game.trace){
  assert.equal(sig(state),sig(step.state));
  assert.ok(legal(state,step.action));
  state=apply(state,step.action);
 }
 assert.equal(game.winner,state.winner);
 assert.equal(game.cutoff,false);
 assert.equal(game.candidateWon,game.winner===game.sigma3Side);
}
const old=stats(prior.games),fresh=stats(hold.games),pooled=stats([...prior.games,...hold.games]);
const crossDuplicates=hold.games.filter(x=>prior.games.some(p=>p.sequenceHash===x.sequenceHash)).length;
const gate={newSeedIndependent:seeds.length===6,
 allGamesFinished:fresh.cutoffs===0,
 hasRolePairForAllSeeds:pairs.length===6,
 noRepeatedFullSequences:fresh.uniqueSequences===fresh.games,
 holdoutWinRateStatisticallyAboveHalf:fresh.wilson95[0]>.5,
 enoughIndependentPairedSeedSets:seeds.length>=20,
 adequateOpeningCoverage:fresh.uniqueFirstSix>=8,
 noProductionPromotion:true};
const report={version:'sigma4-frozen-holdout-v1',previous:old,newHoldout:fresh,pooled,
 crossBatchDuplicateSequences:crossDuplicates,pairedSeeds:pairs,modelPolicyConfig:hold.settings,
 sourceHashes:{prior:shasum('evaluation/sigma4-vs-sigma3-expanded.json'),
 holdout:shasum('evaluation/sigma4-vs-sigma3-holdout.json'),
 candidateSampler:shasum('scripts/sigma4-weighted-research-choice.mjs'),
 sigma3Worker:shasum('scripts/sigma-inference-worker.py')},
 gates:gate,promotionEligible:false,
 limitations:['A 12-game frozen holdout is still too small for reliable promotion.',
  'Different seeds do not guarantee different early opening trajectories.',
  'All games use the currently local SIGMA3 worker SHA, and candidate uses the same worker.',
  'Full game sequence duplication across or within batches reduces effective sample diversity.',
  'Wilson 95% interval assumes Bernoulli independence; games sharing starting state may violate it.']};
writeFileSync('evaluation/sigma4-holdout-verdict.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({prior:old,holdout:fresh,pooled,crossBatchDuplicateSequences:crossDuplicates,gates:gate},null,2));
