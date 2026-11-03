import {readFileSync,writeFileSync} from 'node:fs';
const selfplay=JSON.parse(readFileSync('reports/sigma-selfplay/sigma3-vs-sigma2-seed20261103-24.json','utf8'));
const audit=JSON.parse(readFileSync('evaluation/sigma3-diverse-deep-audit.json','utf8'));
const forced=JSON.parse(readFileSync('evaluation/sigma3-deep-counterfactual-6.json','utf8'));
const research=JSON.parse(readFileSync('evaluation/sigma3-loss-deep-research.json','utf8'));
const hashes=selfplay.completed.map(g=>g.hash);
const sorted=[...new Set(hashes)].map(hash=>({hash,count:hashes.filter(x=>x===hash).length}));
const loss=selfplay.completed.filter(g=>g.winnerVariant==='sigma3');
const changed=audit.positions.filter(p=>p.changed).map(p=>{
 const first=p.deep.root[0];
 return {fixture:p.id,phase:p.phase,baseline:p.baseline.action,deep:p.deep.action,rootLeader:first.action,
   deeperSelectionAgreesWithRoot:JSON.stringify(p.deep.action)===JSON.stringify(first.action),
   visitsTop3:p.deep.root.slice(0,3).map(c=>c.visits),
   rootQTop3:p.deep.root.slice(0,3).map(c=>c.qFromRoot),
   forcedResults:forced.results.filter(r=>r.position===p.id).map(r=>({branch:r.branch,won:r.rootSideWon,plies:r.plies,cutoff:r.cutoff}))
 };
});
const review={
 version:'sigma3-failure-analysis-20261103-v1',
 source:'reports/sigma-selfplay/sigma3-vs-sigma2-seed20261103-24.json',
 historicalGames:selfplay.completed.length,
 distinctGameHashes:sorted.length,
 repeatedGameHashes:sorted,
 sigma2Losses:loss.length,
 sigma2LossDistinctHashes:new Set(loss.map(g=>g.hash)).size,
 lossResearch:{positions:research.positions.length,deepChanged:research.positions.filter(p=>p.changed).length},
 diverseResearch:{positions:audit.positions.length,deepChanged:changed.length,changes:changed},
 nextDecision:'Do not promote deep-search choice; first isolate final selection overrides, use genuinely independent loss positions, and compare root-MCTS leader vs selected move on counterfactual branches',
 limitations:[
  'Only two distinct full game sequences in original 24-game source; game count overstates independent data',
  'Research deep search is 1200 simulations, outside the production 200-sim budget',
  'Forced branch follow-ups use one deterministic seed and Sigma2-vs-Sigma2 continuation; not proof of stronger strategy',
  'Deeper MCTS cannot be assumed to give an optimal action and can be overridden by tactical post-processing'
 ]
};
writeFileSync('evaluation/sigma3-loss-rootcause-review.json',JSON.stringify(review,null,2));
console.log(JSON.stringify({games:review.historicalGames,distinctGameHashes:review.distinctGameHashes,losses:review.sigma2Losses,diverseProbes:review.diverseResearch.positions,changes:changed},null,2));
