import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const p='evaluation/sigma4-original-weighted-vs-sigma23-20261105.json';
const d=JSON.parse(readFileSync(p,'utf8'));
assert.equal(d.games.length,d.planned,'all games must complete');
const key=x=>JSON.stringify(x);
function wilson(w,n){if(!n)return [0,1];const p=w/n,z=1.96,den=1+z*z/n,c=(p+z*z/(2*n))/den,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.max(0,c-h),Math.min(1,c+h)];}
const outcomes=[];
for(const g of d.games){
 let state=initial(),moves=[];
 const fixture=d.fixtures.find(f=>f.id===g.fixture);assert.ok(fixture);
 for(const a of fixture.actions){assert.ok(legal(state,a));moves.push(a);state=apply(state,a);}
 assert.equal(state.turn,0);
 for(const t of g.trace){
  assert.equal(t.side,state.turn);
  assert.ok(legal(state,t.action),'illegal replay '+g.index+' '+t.ply);
  moves.push(t.action);state=apply(state,t.action);
 }
 assert.equal(state.winner,g.winner);
 assert.equal(g.cutoff,state.winner===null);
 assert.equal(g.candidateWon,state.winner===g.candidateSide);
 assert.equal(g.changed,g.trace.filter(t=>t.engine==='candidate'&&t.changed).length);
 assert.equal(g.plies,moves.length);
 assert.equal(g.uniqueHash,createHash('sha256').update(JSON.stringify(moves)).digest('hex'));
 outcomes.push(g);
}
const groups=['sigma2','sigma3'].map(opponent=>{
 const games=outcomes.filter(g=>g.opponent===opponent);
 const wins=games.filter(g=>g.candidateWon).length;
 const paired=d.fixtures.map(f=>{
  const gamesForFixture=games.filter(g=>g.fixture===f.id).sort((a,b)=>a.candidateSide-b.candidateSide);
  assert.equal(gamesForFixture.length,2);
  assert.deepEqual(gamesForFixture.map(g=>g.candidateSide),[0,1]);
  return {fixture:f.id,firstWon:gamesForFixture[0].candidateWon,secondWon:gamesForFixture[1].candidateWon,
   wins:gamesForFixture.filter(g=>g.candidateWon).length};
 });
 return {opponent,games:games.length,wins,losses:games.length-wins,winRate:wins/games.length,
  wilson95:wilson(wins,games.length),firstWins:games.filter(g=>g.candidateSide===0&&g.candidateWon).length,
  secondWins:games.filter(g=>g.candidateSide===1&&g.candidateWon).length,
  uniqueGames:new Set(games.map(g=>g.uniqueHash)).size,uniqueOpenings:new Set(games.map(g=>g.firstSixHash)).size,
  changedMoves:games.reduce((s,g)=>s+g.changed,0),cutoffs:games.filter(g=>g.cutoff).length,paired};
});
const gate={candidateStrongerThanSigma2:groups[0].wilson95[0]>.5&&groups[0].wins>=10,
 candidateStrongerThanSigma3:groups[1].wilson95[0]>.5&&groups[1].wins>=10,
 atLeast20PairedFixturesPerOpponent:groups.every(g=>g.paired.length>=20),
 enoughDistinctOpenings:groups.every(g=>g.uniqueOpenings>=8),
 allGamesFinished:groups.every(g=>g.cutoffs===0),
 enoughIndependentEvidence:false};
gate.enoughIndependentEvidence=gate.candidateStrongerThanSigma2&&gate.candidateStrongerThanSigma3&&
 gate.atLeast20PairedFixturesPerOpponent&&gate.enoughDistinctOpenings&&gate.allGamesFinished;
const assessment={version:'sigma4-original-weighted-20261105-replay-verified-v1',groups,gate,
 outcome:'NO_PROMOTION_UNLESS_ALL_GATES_PASS',allowDefaultSwitch:gate.enoughIndependentEvidence,
 workers:d.provenance,limitations:['The six opening fixtures are historical gameplay openings, not a representative random sample of all Quoridor positions.',
 'Baseline Sigma2 worker has pre-existing local uncommitted code; results correspond to its captured source hash.',
 'SIGMA4 original uses current SIGMA3 MCTS worker with historical visit/Q weighted policy; this is not a trained separate neural model.',
 'A 12-game per-opponent comparison cannot prove the original weighted policy is strongest.'],
 plannedImprovements:['Freeze this exact candidate and current Sigma2/3 worker sources with hashes before further testing.',
 'Build a 40+ paired fixture set including diverse openings, walls, balanced seats and previously unseen midgames.',
 'Run paired ablations with weighted choice on/off using the same state and worker, measure tactical blunders and path quality.',
 'Identify losses with post-decision opponent best-response rollouts over 3-6 plies and measure wall economy.',
 'Optimize risk filters only on training fixtures; evaluate candidate once on untouched holdout fixtures.',
 'Promote only after a convincing independent advantage against both Sigma2 and Sigma3 with no cutoff or legality regressions.']};
writeFileSync('evaluation/sigma4-original-weighted-20261105-assessment.json',JSON.stringify(assessment,null,2)+'\n');
console.log(JSON.stringify({groups:groups.map(({paired,...x})=>x),gate},null,2));
