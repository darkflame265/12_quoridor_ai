import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {legal,apply,distance} from '../src/engine.js';
const games=JSON.parse(readFileSync('evaluation/sigma4-research-games.json','utf8'));
const mined=JSON.parse(readFileSync('evaluation/sigma4-research-mined.json','utf8'));
const source=existsSync('evaluation/sigma4-counterfactual-trials.json')?JSON.parse(readFileSync('evaluation/sigma4-counterfactual-trials.json','utf8')):null;
const all=games.games,groups=[...new Set(all.map(g=>g.openingHash))];
assert.equal(new Set(games.seeds).size,games.seeds.length);
assert.equal(new Set(all.map(g=>g.seed+':'+g.sigma3Side)).size,all.length);
assert.ok(all.every(g=>g.trace.every(t=>legal(t.state,t.action))),'all trace actions must be legal');
assert.ok(all.every(g=>g.trace.every(t=>t.variant===(t.side===g.sigma3Side?'sigma3':'sigma2'))));
assert.ok(all.every(g=>g.winner===null||g.winner===0||g.winner===1));
assert.ok(mined.decisions.every(d=>legal(all.find(g=>g.sequenceHash===d.gameSequenceHash).trace.find(t=>t.ply===d.ply).state,d.chosen)));
const split={trainSeeds:[4187,6721],holdoutSeeds:[9413,12011]};
assert.ok(split.trainSeeds.every(x=>!split.holdoutSeeds.includes(x)));
assert.ok(mined.decisions.every(d=>d.split===(split.trainSeeds.includes(d.seed)?'train':'holdout')));
const pairWins={sigma3:all.filter(g=>g.sigma3Won).length,sigma2:all.filter(g=>g.winner!==null&&!g.sigma3Won).length,cutoffs:all.filter(g=>g.cutoff).length};
const paired=games.seeds.map(seed=>{
 const rows=all.filter(x=>x.seed===seed);
 return {seed,paired:rows.length===2&&rows[0].sigma3Side!==rows[1].sigma3Side,side0Won:rows.some(g=>g.sigma3Side===0&&g.sigma3Won),side1Won:rows.some(g=>g.sigma3Side===1&&g.sigma3Won)};
});
const comparisons=[];
if(source){
 assert.equal(new Set(source.trials.map(x=>x.id+':'+x.choice)).size,source.trials.length);
 for(const id of new Set(source.trials.map(x=>x.id))){
  const pair=source.trials.filter(x=>x.id===id);
  comparisons.push({id,complete:pair.length===2,baselineWon:pair.find(x=>x.choice===0)?.rootWon??null,alternativeWon:pair.find(x=>x.choice===1)?.rootWon??null,cutoffs:pair.filter(x=>x.cutoff).length,
    uniquelySeededFollowups:1,warning:'One deterministic continuation per forced action: insufficient to infer action value'});
 }
}
const result={version:'sigma4-research-pipeline-gate-v1',goal:'Build unbiased diverse samples and causal candidate tests before learning; NO automatic model promotion',
 games:all.length,openings:groups.length,uniqueSequences:new Set(all.map(g=>g.sequenceHash)).size,
 boardSides:{sigma3First:all.filter(x=>x.sigma3Side===0).length,sigma3Second:all.filter(x=>x.sigma3Side===1).length},
 pairWins,paired,split,nonDuplicatedDecisionStates:mined.decisions.length,
 lossCandidateCount:mined.candidateBranches.length,
 counterfactualTrials:source?.trials.length??0,counterfactualPairs:comparisons,
 gates:{complete:all.length===8,diverseOpenings:groups.length===4,allUniqueSequences:new Set(all.map(g=>g.sequenceHash)).size===all.length,
 pairedSides:paired.every(p=>p.paired),nonterminalCutoffs:pairWins.cutoffs===0,
 isolatedHoldout:split.trainSeeds.every(seed=>!split.holdoutSeeds.includes(seed)),
 sufficientTrainingRoots:groups.length>=40,
 sufficientCounterfactualSamples:comparisons.length>=40&&comparisons.every(c=>c.complete&&c.uniquelySeededFollowups>=5),
 enoughHoldoutForSignificance:split.holdoutSeeds.length>=20,
 independentlyVerifiedStrength:false}};
const workerFiles=['scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','server/sigma-process.mjs','src/engine.js'];
result.workerProvenance=workerFiles.map(file=>({path:file,sha256:createHash('sha256').update(readFileSync(file)).digest('hex'),workingTreeStatus:execFileSync('git',['status','--porcelain','--',file],{encoding:'utf8'}).trim()}));
result.gates.frozenReproducibleWorkerSources=result.workerProvenance.every(x=>!x.workingTreeStatus);
result.promoteSigma4=Object.values(result.gates).every(Boolean);
result.status=result.promoteSigma4?'eligible-for-manual-review':'research-only-not-promoted';
result.warnings=['Some game workers may have uncommitted local changes; frozen SHA256 fingerprints recorded in workerProvenance'];
result.next=['Increase independent opening families with controlled natural opening trajectories','Use repeated counterfactual continuations with different opponent search seeds','Train policy/value candidate only on train subset; freeze weights before independent holdout tournament','Run genuinely out-of-sample paired tournament against frozen Sigma2 and Sigma3, both sides, minimum practical statistical power'];
writeFileSync('evaluation/sigma4-research-gate.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({...result,counterfactualPairs:comparisons.slice(0,3)},null,2));
