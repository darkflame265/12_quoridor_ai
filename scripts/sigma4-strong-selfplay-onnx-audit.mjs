import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal,clone,distance} from '../src/engine.js';

const json=p=>JSON.parse(readFileSync('evaluation/'+p,'utf8'));
const fixtures=json('sigma4-strong-selfplay-midgames-20261106.json');
const report=json('sigma4-strong-selfplay-onnx-tournament-20261106.json');
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const canon=s=>hash({p:s.p,walls:s.walls.map(x=>({x:x.x,y:x.y,o:x.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
assert.equal(fixtures.attempts.length,16);
assert.equal(fixtures.openings.length,11);
assert.equal(report.config.fixtureIds.length,10);
assert.equal(report.games.length,60);
assert.equal(report.config.iterations,200);
const ids=new Set(),boards=new Set(),gameKeys=new Set();
for(const start of fixtures.openings){
 assert(!ids.has(start.id));ids.add(start.id);
 let s=initial();
 for(const [i,a] of start.actions.entries()){
  assert(legal(s,a),'source illegal '+start.id+' ply '+i);
  s=apply(s,a);
 }
 assert.deepEqual(s,start.board);
 assert.equal(s.winner,null);
 assert.equal(s.walls.length,start.wallCount);
 assert.equal(canon(s),start.positionId);
 assert(!boards.has(start.positionId));boards.add(start.positionId);
 assert.equal(start.ownDistance,distance(s,s.turn));
 assert.equal(start.enemyDistance,distance(s,1-s.turn));
}
const fixtureById=Object.fromEntries(fixtures.openings.map(x=>[x.id,x]));
const group=new Map();
let cutoffs=0,illegal=0;
const durations={original:[],corrected:[]};
for(const game of report.games){
 const p=fixtureById[game.id];
 assert(p);
 assert(report.config.fixtureIds.some(x=>x.id===game.id&&x.positionId===p.positionId));
 assert.equal(game.totalPlies,game.actions.length);
 assert(game.totalPlies<=200);
 assert.deepEqual(game.actions.slice(0,p.ply),p.actions);
 assert.equal(game.actionsHash,hash(game.actions));
 const key=[game.id,game.mode,game.side,game.variant??'head'].join('/');
 assert(!gameKeys.has(key));gameKeys.add(key);
 if(game.draw)cutoffs++;
 let s=initial();
 for(const [i,a] of game.actions.entries()){
  if(!legal(s,a)){illegal++;throw Error('illegal '+key+' ply '+i);}
  s=apply(s,a);
 }
 assert.equal(game.winner,s.winner);
 if(game.mode==='head-to-head'){
  assert.equal(game.correctedSeat,game.side);
  assert.equal(game.originalSeat,1-game.side);
  assert.equal(game.opponent,'other');
  assert.equal(game.correctedWon,s.winner===game.correctedSeat);
  assert.equal(game.originalWon,s.winner===game.originalSeat);
 }else{
  assert(['sigma2','sigma3'].includes(game.opponent));
  if(game.variant==='corrected')assert.equal(game.correctedSeat,game.side);
  if(game.variant==='original')assert.equal(game.originalSeat,game.side);
  assert.equal(game.candidateWon,s.winner===game.side);
 }
 durations.original.push(...game.timings.original);
 durations.corrected.push(...game.timings.corrected);
 if(!group.has(game.id))group.set(game.id,[]);
 group.get(game.id).push(game);
}
assert.equal(group.size,10);
for(const [id,gs] of group)assert.equal(gs.length,6,'missing role/opponent pair '+id);
const head=report.games.filter(g=>g.mode==='head-to-head');
const external=report.games.filter(g=>g.mode==='external');
assert.equal(head.length,20);
assert.equal(external.length,40);
const pair=[];
for(const p of report.config.fixtureIds){
 for(const side of [0,1]){
  const items=external.filter(x=>x.id===p.id&&x.side===side);
  assert.equal(items.length,2);
  const original=items.find(x=>x.variant==='original'),corrected=items.find(x=>x.variant==='corrected');
  assert(original&&corrected&&original.opponent===corrected.opponent);
  assert.equal(original.refSeed,corrected.refSeed);
  assert.equal(original.totalPlies-original.continuationPlies,p.ply);
  assert.equal(corrected.totalPlies-corrected.continuationPlies,p.ply);
  pair.push({id:p.id,split:p.split,side,opponent:original.opponent,
   originalWon:original.candidateWon,correctedWon:corrected.candidateWon,
   improved:!original.candidateWon&&corrected.candidateWon,
   regressed:original.candidateWon&&!corrected.candidateWon,
   differentSequence:original.actionsHash!==corrected.actionsHash});
 }
}
function measure(arr){
 if(!arr.length)return null;
 const v=[...arr].sort((a,b)=>a-b),q=p=>v[Math.ceil(p*v.length)-1];
 return {moves:v.length,meanMs:v.reduce((a,b)=>a+b,0)/v.length,p95Ms:q(.95),p99Ms:q(.99),
  over500:v.filter(t=>t>500).length,maxMs:v.at(-1)};
}
const split=type=>{
 const hs=head.filter(x=>fixtureById[x.id].split===type);
 const ps=pair.filter(x=>x.split===type);
 return {sourceBoards:new Set(hs.map(g=>g.id)).size,headGames:hs.length,
  headCorrectedWins:hs.filter(x=>x.correctedWon).length,
  headOriginalWins:hs.filter(x=>x.originalWon).length,
  externalPairs:ps.length,externalCorrectedWins:ps.filter(x=>x.correctedWon).length,
  externalOriginalWins:ps.filter(x=>x.originalWon).length,
  improved:ps.filter(x=>x.improved).length,regressed:ps.filter(x=>x.regressed).length};
};
const findings={
 version:'sigma4-strong-engine-match-audit-v1',
 source:{attempts:fixtures.attempts.length,uniqueStrongMidgames:fixtures.openings.length,
  selectedStarts:report.config.fixtureIds.length,first12Available:false},
 overall:{games:report.games.length,headToHeadGames:head.length,
  correctedHeadWins:head.filter(x=>x.correctedWon).length,
  originalHeadWins:head.filter(x=>x.originalWon).length,
  draws:cutoffs,
  externalGames:external.length,externalPairs:pair.length,
  originalExternalWins:pair.filter(x=>x.originalWon).length,
  correctedExternalWins:pair.filter(x=>x.correctedWon).length,
  externalWinsImproved:pair.filter(x=>x.improved).length,
  externalWinsRegressed:pair.filter(x=>x.regressed).length,
  externalPairsWithDifferentSequences:pair.filter(x=>x.differentSequence).length},
 bySplit:{development:split('development'),holdout:split('holdout')},
 byOpponent:Object.fromEntries(['sigma2','sigma3'].map(op=>{
  const filtered=pair.filter(x=>x.opponent===op);
  return [op,{pairs:filtered.length,originalWins:filtered.filter(x=>x.originalWon).length,
   correctedWins:filtered.filter(x=>x.correctedWon).length}]})),
 latency:{original:measure(durations.original),corrected:measure(durations.corrected)},
 pairedResults:pair,
 gates:{fullGameReplayLegal:illegal===0,distinctStartingStates:true,
  allGamesFinished:cutoffs===0,
  positivePairDelta:pair.filter(x=>x.improved).length>pair.filter(x=>x.regressed).length,
  correctedStrictlyUnder500:durations.corrected.every(x=>x<=500),
  promotionApproved:false},
 limitations:['Ten source midgames from selfplay of two policies using the same base network; no independent solved labels',
  'Only three source-group holdout starts in the selected ten; conclusions remain low power',
  'Role-reversed direct games are not statistically independent of their source fixture',
  'The source policy is MCTS based but does not ensure optimal gameplay',
  'Local sigma2 worker has pre-existing uncommitted user changes',
  'Warm process timings exclude start-up and remote transport']};
writeFileSync('evaluation/sigma4-strong-selfplay-onnx-audit-20261106.json',JSON.stringify(findings,null,2)+'\n');
console.log('PASS STRONG ENGINE AUDIT',JSON.stringify({overall:findings.overall,bySplit:findings.bySplit,
 byOpponent:findings.byOpponent,latency:findings.latency,gates:findings.gates}));
