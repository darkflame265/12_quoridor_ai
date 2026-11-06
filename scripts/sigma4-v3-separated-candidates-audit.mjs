import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const filename='evaluation/sigma4-v3-candidate-paired-pilot-20261106.json';
const d=JSON.parse(readFileSync(filename,'utf8'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const count=d.config.fixtures.length*d.config.opponents.length*2*d.config.variants.length;
assert.equal(count,64);
assert.equal(d.games.length,count,'full pilot must finish before promotion verdict');
const seen=new Set(),paired=new Map(),timing={},violations=[];
for(const game of d.games){
 const key=[game.fixture,game.opponent,game.seat,game.variant].join('/');
 assert(!seen.has(key));seen.add(key);
 const fixture=d.config.fixtures.find(f=>f.id===game.fixture);assert(fixture);
 assert(game.totalPlies===game.actions.length&&game.totalPlies<=d.config.maxPlies);
 assert(!game.cutoff,'no winner by move cap '+key);
 assert(game.winner===0||game.winner===1);
 assert.equal(game.candidateWon,game.winner===game.seat);
 assert.equal(game.actionsSha,sha(game.actions));
 assert.deepEqual(game.actions.slice(0,fixture.actions.length),fixture.actions);
 assert.equal(game.candidateSamples,game.latencies.length);
 let s=initial();
 for(const [ply,a] of game.actions.entries()){
  assert(legal(s,a),'illegal move '+key+' ply '+ply);s=apply(s,a);
 }
 assert.equal(s.winner,game.winner);
 const group=[game.fixture,game.opponent,game.seat].join('/');
 if(!paired.has(group))paired.set(group,[]);
 paired.get(group).push(game);
 (timing[game.variant]??=[]).push(...game.latencies);
}
assert.equal(paired.size,16);
const result={version:'sigma4-v3-separated-candidates-audit-v1',
 candidatePolicies:d.config.variants,
 sourceHashes:d.config.sourceSha256,
 completeGames:d.games.length,
 independentFixturedStarts:d.config.fixtures.length,
 pairedGroups:paired.size,
 outcomes:{},latency:{},pairwise:{},
 holdoutStrengthApproved:false,
 productionDefaultChangeApproved:false};
const timings=x=>{
 const v=[...x].sort((a,b)=>a-b),p=q=>v[Math.ceil(v.length*q)-1];
 return {moves:v.length,meanMs:v.reduce((a,b)=>a+b,0)/v.length,p95Ms:p(.95),maxMs:v.at(-1),over500:v.filter(y=>y>500).length};
};
for(const variant of d.config.variants){
 const matches=d.games.filter(g=>g.variant===variant);
 result.outcomes[variant]={games:matches.length,wins:matches.filter(g=>g.candidateWon).length,
  versusSigma2:{games:matches.filter(g=>g.opponent==='sigma2').length,
    wins:matches.filter(g=>g.opponent==='sigma2'&&g.candidateWon).length},
  versusSigma3:{games:matches.filter(g=>g.opponent==='sigma3').length,
    wins:matches.filter(g=>g.opponent==='sigma3'&&g.candidateWon).length},
  side0:{games:matches.filter(g=>g.seat===0).length,wins:matches.filter(g=>g.seat===0&&g.candidateWon).length},
  side1:{games:matches.filter(g=>g.seat===1).length,wins:matches.filter(g=>g.seat===1&&g.candidateWon).length},
  changedRootChoice:matches.reduce((sum,g)=>sum+g.safetyChecks.changed,0),
  triggeredSafetyOrEmergency:matches.reduce((sum,g)=>sum+g.safetyChecks.blocked,0)};
 result.latency[variant]=timings(timing[variant]);
 if(variant==='baseline')continue;
 const comparisons=[];
 for(const [key,gameSet] of paired){
  assert.equal(gameSet.length,4);
  const baseline=gameSet.find(g=>g.variant==='baseline'),alternative=gameSet.find(g=>g.variant===variant);
  assert(baseline&&alternative);
  assert.deepEqual(baseline.actions.slice(0,d.config.fixtures.find(f=>f.id===baseline.fixture).actions.length),
   alternative.actions.slice(0,d.config.fixtures.find(f=>f.id===baseline.fixture).actions.length));
  comparisons.push({fixture:baseline.fixture,opponent:baseline.opponent,seat:baseline.seat,
   originalWon:baseline.candidateWon,variantWon:alternative.candidateWon,
   improved:!baseline.candidateWon&&alternative.candidateWon,
   regressed:baseline.candidateWon&&!alternative.candidateWon,
   sameEntireGame:baseline.actionsSha===alternative.actionsSha});
 }
 result.pairwise[variant]={paired:comparisons.length,
  improved:comparisons.filter(x=>x.improved).length,regressed:comparisons.filter(x=>x.regressed).length,
  unchanged:comparisons.filter(x=>x.originalWon===x.variantWon).length,
  sequenceChanged:comparisons.filter(x=>!x.sameEntireGame).length,comparisons,
  candidateCanAdvance:comparisons.filter(x=>x.improved).length>comparisons.filter(x=>x.regressed).length&&
    result.latency[variant].p95Ms<=result.latency.baseline.p95Ms};
}
writeFileSync('evaluation/sigma4-v3-separated-candidates-audit-20261106.json',JSON.stringify(result,null,2)+'\n');
console.log('PASS SIGMA4 V3 PILOT',JSON.stringify({outcomes:result.outcomes,latency:result.latency,
 pairwise:Object.fromEntries(Object.entries(result.pairwise).map(([k,v])=>[k,{paired:v.paired,improved:v.improved,
 regressed:v.regressed,unchanged:v.unchanged,sequenceChanged:v.sequenceChanged,canAdvance:v.candidateCanAdvance}]))},null,2));
