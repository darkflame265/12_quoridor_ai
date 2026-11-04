import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
import {checkSigma4Promotion} from './sigma4-promotion-evidence.mjs';
const file='evaluation/sigma4-lookahead-vs-sigma3.json';
const data=JSON.parse(readFileSync(file,'utf8'));
assert.equal(data.games.length,data.planned,'tournament must finish');
const prior=new Set(JSON.parse(readFileSync('evaluation/sigma4-vs-sigma3-holdout.json')).settings.seedList);
const seeds=[...new Set(data.games.map(g=>g.seed))];
assert.ok(seeds.every(s=>!prior.has(s)));
const canonical=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
const pairs=[],reasons={},result={games:data.games.length,wins:0,firstWins:0,secondWins:0,changedMoves:0,
 uniqueSequences:new Set(),uniqueOpenings:new Set(),cutoffs:0};
for(const seed of seeds){
 const g=data.games.filter(g=>g.seed===seed).sort((a,b)=>a.sigma3Side-b.sigma3Side);
 assert.equal(g.length,2);assert.deepEqual(g.map(x=>x.sigma3Side),[0,1]);
 pairs.push({seed,firstWon:g[0].candidateWon,secondWon:g[1].candidateWon});
}
for(const g of data.games){
 let state=initial();
 assert.deepEqual(g.openingPrefix,[]);
 for(const [i,step] of g.trace.entries()){
  assert.equal(step.ply,i);assert.equal(canonical(step.state),canonical(state));
  assert.ok(legal(state,step.action));state=apply(state,step.action);
 }
 assert.equal(state.winner,g.winner);
 assert.equal(g.candidateWon,g.winner===g.sigma3Side);
 assert.ok(!g.cutoff);
 result.wins+=Number(g.candidateWon);
 result.firstWins+=Number(g.candidateWon&&g.sigma3Side===0);
 result.secondWins+=Number(g.candidateWon&&g.sigma3Side===1);
 result.changedMoves+=g.overrides;
 result.uniqueSequences.add(g.sequenceHash);result.uniqueOpenings.add(g.firstSixHash);
 for(const [k,v] of Object.entries(g.tacticalReasons||{}))reasons[k]=(reasons[k]||0)+v;
}
result.uniqueSequences=result.uniqueSequences.size;
result.uniqueOpenings=result.uniqueOpenings.size;
result.losses=result.games-result.wins;
result.winRate=result.wins/result.games;
const promotion=checkSigma4Promotion({games:result.games,wins:result.wins,uniqueGames:result.uniqueSequences,
 uniqueFirstSix:result.uniqueOpenings,seedPairs:seeds.length,pairedRoles:true,cutoffs:0,modelsFrozen:true});
const hashes=Object.fromEntries(['scripts/sigma4-lookahead-choice.mjs','scripts/sigma4-tactical-escape.mjs','scripts/sigma-inference-worker.py','scripts/sigma4-lookahead-vs-sigma3.mjs'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const out={version:'sigma4-minimax-three-ply-validation-v1',stats:result,pairedSeeds:pairs,reasons,promotion,hashes,
 caveats:['Depth-3 selective minimax is not a game-solving proof','Tactical search only considers MCTS root candidates and a bounded reply subset','Small game sample is not a proven advantage over SIGMA3','The candidate is research-only; production engine unchanged']};
writeFileSync('evaluation/sigma4-lookahead-verdict.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({stats:result,reasons,promotion:{eligible:promotion.eligible,blockingReasons:promotion.blockingReasons}},null,2));
