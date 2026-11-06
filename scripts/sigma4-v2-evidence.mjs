import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const prior=read('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json');
const training=read('evaluation/sigma4-adaptive-v2-vs-sigma23-20261105.json');
const held=read('evaluation/sigma4-v2-holdout-duels-20261105.json');
const risk=read('evaluation/sigma4-original-weighted-loss-audit.json');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const H=x=>createHash('sha256').update(x).digest('hex');
const summary={version:'sigma4-v2-comparison-audit-v1',training:[],holdout:[],risk:risk.groups};
const endWinner=(game,fixtures,kind)=>{
 const fixture=fixtures.find(f=>f.id===game.fixture);
 assert.ok(fixture,'fixture missing '+game.fixture);
 let s=initial(),moves=[];
 for(const a of fixture.actions){assert.ok(legal(s,a));moves.push(a);s=apply(s,a);}
 if(kind==='train'){
  for(const row of game.trace){assert.equal(s.turn,row.side);assert.ok(legal(s,row.action));moves.push(row.action);s=apply(s,row.action);}
  assert.equal(game.uniqueHash,H(JSON.stringify(moves)));
 }else{
  for(const a of game.moves.slice(6)){assert.ok(legal(s,a));s=apply(s,a);moves.push(a);}
  assert.equal(game.sequenceHash,hash(game.moves));
 }
 assert.equal(game.plies,moves.length);
 assert.equal(s.winner,game.winner);
 assert.equal(game.cutoff,s.winner===null);
 assert.equal(game.candidateWon,s.winner===game.candidateSide);
};
assert.equal(prior.games.length,24);assert.equal(training.games.length,training.planned);
assert.equal(held.games.length,held.planned);
assert.equal(training.provenance.sigma2Worker,prior.provenance.sigma2Worker);
assert.equal(training.provenance.sigma3Worker,prior.provenance.sigma3Worker);
assert.equal(held.provenance.sigma2,prior.provenance.sigma2Worker);
assert.equal(held.provenance.sigma3,prior.provenance.sigma3Worker);
const oldOpen=new Set(prior.fixtures.map(f=>hash(f.actions)));
assert.ok(held.fixtures.every(f=>!oldOpen.has(hash(f.actions))),'holdout fixtures overlap');
for(const game of prior.games)endWinner(game,prior.fixtures,'train');
for(const game of training.games)endWinner(game,training.fixtures,'train');
for(const game of held.games)endWinner(game,held.fixtures,'held');
const wilson=(wins,n)=>{const z=1.96,p=wins/n,den=1+z*z/n,c=(p+z*z/(2*n))/den,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;return [Math.max(0,c-h),Math.min(1,c+h)];};
const group=(rows,opponent,variant)=>{const games=rows.filter(g=>g.opponent===opponent&&(!variant||g.variant===variant));const wins=games.filter(g=>g.candidateWon).length;return {games:games.length,wins,losses:games.length-wins,winRate:wins/games.length,wilson95:wilson(wins,games.length),firstWins:games.filter(g=>g.candidateWon&&g.candidateSide===0).length,secondWins:games.filter(g=>g.candidateWon&&g.candidateSide===1).length,cutoffs:games.filter(g=>g.cutoff).length,unique:new Set(games.map(g=>g.uniqueHash??g.sequenceHash)).size,avgOverrides:games.reduce((a,b)=>a+b.changed,0)/games.length};};
for(const opponent of ['sigma2','sigma3']){
 const orig=group(prior.games,opponent),v2=group(training.games,opponent);
 const origin=prior.games.filter(g=>g.opponent===opponent);
 const changes=origin.map(g=>{const modified=training.games.find(x=>x.opponent===opponent&&x.fixture===g.fixture&&x.candidateSide===g.candidateSide);assert.ok(modified);return {fixture:g.fixture,side:g.candidateSide,originalWon:g.candidateWon,v2Won:modified.candidateWon};});
 summary.training.push({opponent,original:orig,v2,pairedResult:{v2Gain:changes.filter(x=>x.v2Won&&!x.originalWon).length,v2Loss:changes.filter(x=>!x.v2Won&&x.originalWon).length,ties:changes.filter(x=>x.v2Won===x.originalWon).length}});
 const originalHeld=group(held.games,opponent,'original'),v2Held=group(held.games,opponent,'adaptive-v2');
 const paired=held.games.filter(g=>g.opponent===opponent&&g.variant==='original').map(g=>{
  const match=held.games.find(x=>x.opponent===opponent&&x.fixture===g.fixture&&x.candidateSide===g.candidateSide&&x.variant==='adaptive-v2');
  assert.ok(match);return {fixture:g.fixture,side:g.candidateSide,originalWon:g.candidateWon,v2Won:match.candidateWon};
 });
 summary.holdout.push({opponent,original:originalHeld,v2:v2Held,pairedResult:{v2Gain:paired.filter(x=>x.v2Won&&!x.originalWon).length,v2Loss:paired.filter(x=>!x.v2Won&&x.originalWon).length,ties:paired.filter(x=>x.v2Won===x.originalWon).length}});
}
summary.gates={allFinished:[...summary.training,...summary.holdout].every(g=>g.v2.cutoffs===0&&g.original.cutoffs===0),
 noTrainingHoldoutOverlap:true,
 enoughUniqueFixtures:held.fixtures.length>=40,
 statisticallyBetterThanBoth:summary.holdout.every(g=>g.v2.wilson95[0]>.5),
 materiallyBetterThanOriginal:summary.holdout.every(g=>g.v2.wins>g.original.wins),
 productionPromotionApproved:false};
summary.gates.productionPromotionApproved=summary.gates.allFinished&&summary.gates.enoughUniqueFixtures&&summary.gates.statisticallyBetterThanBoth&&summary.gates.materiallyBetterThanOriginal;
summary.caveats=['Historical pilot data was used to design v2, so the training comparison is NOT independent evidence.','New fixtures are deterministic legal generated openings; only four used per opponent and the distribution is not representative of optimal human play.','Seat-paired games are correlated; Wilson intervals are descriptive and do not substitute for clustered paired uncertainty.','If v2 is not better on untouched fixtures, do not promote it or claim strength improvement.'];
writeFileSync('evaluation/sigma4-v2-evidence.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({training:summary.training,holdout:summary.holdout,gates:summary.gates},null,2));
