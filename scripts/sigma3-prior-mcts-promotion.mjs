import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const files=['evaluation/sigma3-prior-mcts-opening-20.json','evaluation/sigma3-prior-mcts-holdout-20.json'];
const base=[];
for(const file of files){
 const d=JSON.parse(readFileSync(file,'utf8'));
 assert.equal(d.totalGames,20);
 assert.equal(d.games.length,20);
 const groups=[];
 for(let i=0;i<5;i++)for(const side of [0,1]){
  const pair=d.games.filter(g=>JSON.stringify(g.opening)===JSON.stringify(d.games[i*4].opening)&&g.side===side);
  assert.equal(pair.length,2);
  const baseline=pair.find(g=>g.arm==='base'),candidate=pair.find(g=>g.arm==='guard');
  assert.ok(baseline&&candidate);
  assert.deepEqual(baseline.opening,candidate.opening);
  groups.push({opening:i,side,baselineWon:baseline.rootWon,candidateWon:candidate.rootWon,baselinePlies:baseline.plies,candidatePlies:candidate.plies,candidateChanges:candidate.changes});
 }
 base.push({file,completed:d.games.length,baselineWins:groups.filter(g=>g.baselineWon).length,candidateWins:groups.filter(g=>g.candidateWon).length,improved:groups.filter(g=>!g.baselineWon&&g.candidateWon),regressed:groups.filter(g=>g.baselineWon&&!g.candidateWon),candidateCutoffs:d.games.filter(g=>g.arm==='guard'&&g.cutoff).length,overrides:groups.reduce((n,g)=>n+g.candidateChanges.length,0),groups});
}
const baselineWins=base.reduce((n,x)=>n+x.baselineWins,0),candidateWins=base.reduce((n,x)=>n+x.candidateWins,0);
const newRegressions=base.flatMap((r,i)=>r.regressed.map(g=>({pool:i,opening:g.opening,side:g.side})));
const improvements=base.flatMap((r,i)=>r.improved.map(g=>({pool:i,opening:g.opening,side:g.side})));
const summary={version:'sigma3-prior-mcts-promotion-v1',status:'experimental-only',pairedMatchups:20,totalRecordedGames:40,newlyExecutedCandidateGames:20,reusedBaselineGames:20,distinctScriptedOpenings:10,sideMatchups:{first:10,second:10},baseline:{wins:baselineWins,losses:20-baselineWins,winRate:baselineWins/20},candidate:{wins:candidateWins,losses:20-candidateWins,winRate:candidateWins/20},improvements,regressions:newRegressions,cutoffs:base.reduce((n,x)=>n+x.candidateCutoffs,0),overrides:base.reduce((n,x)=>n+x.overrides,0),pools:base.map(({groups,...rest})=>rest)};
summary.gates={pairedComplete:base.every(r=>r.completed===20),improvedWinRate:candidateWins>baselineWins,noPairedRegressions:newRegressions.length===0,noCutoffs:summary.cutoffs===0,enoughStartDiversity:summary.distinctScriptedOpenings>=20,independentHeldOutOpenings:false};
summary.promote=Object.values(summary.gates).every(Boolean);
summary.limitations=['Fixed deterministic openings only; not a representative random sample of complete games','Two previous pools include already-inspected positions; tests can overfit','Experimental root-prior adjustment only; preserve production until stronger evidence and regression-free evaluation'];
writeFileSync('evaluation/sigma3-prior-mcts-promotion.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({...summary,pools:summary.pools.map(p=>({file:p.file,baselineWins:p.baselineWins,candidateWins:p.candidateWins,regressions:p.regressed.length,improvements:p.improved.length}))},null,2));
