import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
const prior=JSON.parse(readFileSync('evaluation/sigma4-vs-sigma3-expanded.json','utf8'));
const holdout=JSON.parse(readFileSync('evaluation/sigma4-vs-sigma3-holdout.json','utf8'));
const pilot=JSON.parse(readFileSync('evaluation/sigma4-guarded-vs-sigma3-pilot.json','utf8'));
const risk=JSON.parse(readFileSync('evaluation/sigma4-choice-risk-audit.json','utf8'));
const allOldSeeds=new Set([...prior.games,...holdout.games].map(g=>g.seed));
const trialSeeds=new Set(pilot.games.map(g=>g.seed));
assert.ok([...trialSeeds].every(seed=>!allOldSeeds.has(seed)));
assert.equal(pilot.games.length,pilot.planned);
const key=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
const stats=(data)=>({games:data.games.length,wins:data.games.filter(g=>g.candidateWon).length,
 losses:data.games.filter(g=>!g.candidateWon).length,unique:new Set(data.games.map(g=>g.sequenceHash)).size,
 firstSix:new Set(data.games.map(g=>g.firstSixHash)).size,overrides:data.games.reduce((n,g)=>n+g.overrides,0),
 firstWins:data.games.filter(g=>g.candidateWon&&g.sigma3Side===0).length,
 secondWins:data.games.filter(g=>g.candidateWon&&g.sigma3Side===1).length});
const pairs=[];
for(const seed of trialSeeds){
 const rows=pilot.games.filter(g=>g.seed===seed).sort((a,b)=>a.sigma3Side-b.sigma3Side);
 assert.equal(rows.length,2);
 assert.deepEqual(rows.map(g=>g.sigma3Side),[0,1]);
 pairs.push({seed,candidateFirstWon:rows[0].candidateWon,candidateSecondWon:rows[1].candidateWon});
}
for(const g of pilot.games){
 let s=initial();
 for(let ply=0;ply<g.trace.length;ply++){
  const t=g.trace[ply];assert.equal(t.ply,ply);assert.equal(key(s),key(t.state));
  assert.ok(legal(s,t.action));s=apply(s,t.action);
 }
 assert.equal(s.winner,g.winner);
 assert.equal(g.cutoff,false);
 assert.equal(g.candidateWon,g.winner===g.sigma3Side);
}
const report={version:'sigma4-guarded-early-evaluation-v1',originalWeighted:stats(prior),
 originalHoldout:stats(holdout),guardedPilot:stats(pilot),pairs,
 riskAssociation:risk.summary.map(x=>({name:x.name,group:x.group})),
 gates:{seedsFresh:true,rolePairsComplete:true,allMovesLegal:true,
 broadIndependentWinRateEvidence:false,statisticallyHigherThanNative:false,
 productionPromotable:false},
 status:'research-only',
 interpretation:['Conservative research sampling limits Q gap and required root-visit support but remains experimental',
 'Small four-game pilot cannot establish stronger play, even if observed wins are high',
 'Risk association from earlier games guided this design; earlier games must not be reused as independent validation']};
writeFileSync('evaluation/sigma4-guarded-pilot-assessment.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({guarded:report.guardedPilot,pairs,gates:report.gates},null,2));
