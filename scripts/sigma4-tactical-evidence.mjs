import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
import {checkSigma4Promotion} from './sigma4-promotion-evidence.mjs';
const batches=[
 {tag:'weighted-historical-holdout',file:'evaluation/sigma4-vs-sigma3-holdout.json'},
 {tag:'tactical-one-ply',file:'evaluation/sigma4-tactical-vs-sigma3.json'},
 {tag:'tactical-emergency-defense',file:'evaluation/sigma4-emergency-vs-sigma3.json'}
];
const seedsGlobal=new Set(),report={version:'sigma4-tactical-independent-evidence-v1',batches:[],productionChanged:false,modelRetrained:false};
const canonical=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
for(const batch of batches){
 const d=JSON.parse(readFileSync(batch.file,'utf8'));
 const seeds=[...new Set(d.games.map(g=>g.seed))];
 assert.equal(d.planned,d.games.length,batch.tag+' incomplete');
 const groups=[];
 for(const seed of seeds){
  assert.ok(!seedsGlobal.has(seed),'reused seed');seedsGlobal.add(seed);
  const pair=d.games.filter(g=>g.seed===seed).sort((a,b)=>a.sigma3Side-b.sigma3Side);
  assert.equal(pair.length,2);assert.deepEqual(pair.map(g=>g.sigma3Side),[0,1]);
  groups.push({seed,candidateWins:pair.filter(g=>g.candidateWon).length});
 }
 const stats={games:d.games.length,wins:0,firstWins:0,secondWins:0,cutoffs:0,changedMoves:0,emergencyDefenses:0,immediateWins:0};
 const fullSequences=new Set(),openings=new Set();
 for(const game of d.games){
  assert.equal(game.plies,game.trace.length);assert.deepEqual(game.openingPrefix,[]);
  let s=initial();
  for(const t of game.trace){assert.equal(canonical(s),canonical(t.state));assert.ok(legal(s,t.action));s=apply(s,t.action);}
  assert.equal(s.winner,game.winner);assert.equal(game.candidateWon,game.winner===game.sigma3Side);
  if(game.cutoff)stats.cutoffs++;
  if(game.candidateWon){stats.wins++;if(game.sigma3Side===0)stats.firstWins++;else stats.secondWins++;}
  stats.changedMoves+=game.overrides||0;
  stats.emergencyDefenses+=game.tacticalReasons?.['exhaustive-immediate-loss-defense']||0;
  stats.immediateWins+=game.tacticalReasons?.['forced-immediate-win']||0;
  fullSequences.add(game.sequenceHash);openings.add(game.firstSixHash);
 }
 stats.uniqueSequences=fullSequences.size;stats.openingSix=openings.size;stats.winRate=stats.wins/stats.games;stats.losses=stats.games-stats.wins;
 const evidence=checkSigma4Promotion({games:stats.games,wins:stats.wins,uniqueGames:stats.uniqueSequences,
  uniqueFirstSix:stats.openingSix,seedPairs:seeds.length,pairedRoles:true,cutoffs:stats.cutoffs,modelsFrozen:true});
 report.batches.push({name:batch.tag,groups,stats,evidence});
}
report.sourceSha256=Object.fromEntries(['scripts/sigma4-tactical-choice.mjs','scripts/sigma4-tactical-escape.mjs','scripts/sigma4-weighted-research-choice.mjs','scripts/sigma-inference-worker.py'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
report.gates={noSourceSeedReuse:seedsGlobal.size===report.batches.reduce((n,b)=>n+b.groups.length,0),noUnfinishedGames:report.batches.every(x=>x.stats.cutoffs===0),allFullReplaysValid:true,anyPromotionSupported:report.batches.some(x=>x.evidence.eligible),researchOnly:true};
writeFileSync('evaluation/sigma4-tactical-evidence.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({batches:report.batches.map(x=>({name:x.name,stats:x.stats,eligible:x.evidence.eligible})),gates:report.gates},null,2));
