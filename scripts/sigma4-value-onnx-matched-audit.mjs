import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';

const p='evaluation/sigma4-value-research-onnx-matched-pilot-20261106.json';
const report=JSON.parse(readFileSync(p,'utf8'));
const bank=Object.fromEntries(readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse).map(x=>[x.id,x]));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
assert.equal(report.config.starts.length,4);
assert.equal(report.config.simulations,200);
assert.equal(report.games.length,32,'uncompleted pilot');
const comparisons=[],byKey=new Map();
const allTimings={original:[],corrected:[]},seen=new Set();
for(const game of report.games){
 const b=bank[game.id];
 assert(b?.split==='holdout');
 assert(game.totalPlies===game.actions.length);
 assert(game.totalPlies<=200&&!game.cutoff);
 assert.equal(game.candidateWon,game.winner===game.side);
 assert.equal(game.actionsHash,sha(game.actions));
 assert.deepEqual(game.actions.slice(0,b.ply),b.actions);
 assert(game.candidateMoves===game.candidateTimingsMs.length);
 assert(game.candidateTimingsMs.every(ms=>ms>=0&&Number.isFinite(ms)));
 if(game.variant==='corrected')
  assert(game.correctionEvaluationCounts.length===game.candidateMoves);
 else assert(game.correctionEvaluationCounts.length===0);
 let s=initial();
 for(const [i,action] of game.actions.entries()){
  assert(legal(s,action),'illegal full-game move '+game.id+' '+i);
  s=apply(s,action);
 }
 assert.equal(s.winner,game.winner);
 const group=[game.id,game.op,game.side].join('/');
 const key=group+'/'+game.variant;
 assert(!seen.has(key));seen.add(key);
 if(!byKey.has(group))byKey.set(group,[]);
 byKey.get(group).push(game);
 allTimings[game.variant].push(...game.candidateTimingsMs);
}
assert.equal(byKey.size,16);
for(const [key,games] of byKey){
 assert.equal(games.length,2);
 const orig=games.find(g=>g.variant==='original');
 const trial=games.find(g=>g.variant==='corrected');
 assert(orig&&trial&&orig.policySeed===trial.policySeed);
 assert.deepEqual(orig.actions.slice(0,bank[orig.id].ply),trial.actions.slice(0,bank[orig.id].ply));
 const changed=orig.actionsHash!==trial.actionsHash;
 comparisons.push({id:orig.id,opponent:orig.op,candidateSide:orig.side,seed:orig.policySeed,
  originalWon:orig.candidateWon,correctedWon:trial.candidateWon,changedGameSequence:changed,
  improved:!orig.candidateWon&&trial.candidateWon,regressed:orig.candidateWon&&!trial.candidateWon,
  originalPlies:orig.totalPlies,correctedPlies:trial.totalPlies});
}
function timings(samples){
 const sorted=[...samples].sort((a,b)=>a-b),pct=p=>sorted[Math.ceil(sorted.length*p)-1];
 return {moves:samples.length,meanMs:samples.reduce((x,y)=>x+y,0)/samples.length,
  medianMs:pct(.5),p95Ms:pct(.95),p99Ms:pct(.99),maxMs:sorted.at(-1),
  over500:samples.filter(v=>v>500).length};
}
const variants=Object.fromEntries(['original','corrected'].map(v=>{
 const gs=report.games.filter(x=>x.variant===v);
 return [v,{games:gs.length,wins:gs.filter(x=>x.candidateWon).length,
  losses:gs.filter(x=>!x.candidateWon).length,
  vsSigma2:{games:gs.filter(x=>x.op==='sigma2').length,wins:gs.filter(x=>x.op==='sigma2'&&x.candidateWon).length},
  vsSigma3:{games:gs.filter(x=>x.op==='sigma3').length,wins:gs.filter(x=>x.op==='sigma3'&&x.candidateWon).length},
  latency:timings(allTimings[v])}];
}));
const audit={version:'sigma4-residual-onnx-matched-match-audit-v1',
 gates:{all32GamesComplete:true,allMovesLegal:true,startingPositionsTrainingDisjoint:true,
  matchedPolicySeed:true,
  winningImprovement:comparisons.filter(c=>c.improved).length>comparisons.filter(c=>c.regressed).length,
  "500msStrict":false,productionApproved:false},
 variants,pairedComparisons:comparisons,
 totals:{paired:comparisons.length,improved:comparisons.filter(c=>c.improved).length,
  regressed:comparisons.filter(c=>c.regressed).length,
  unchanged:comparisons.filter(c=>c.originalWon===c.correctedWon).length,
  actionSequencesChanged:comparisons.filter(c=>c.changedGameSequence).length},
 limitations:['Only four starting boards; each repeated for both seats and two opponents',
  'Prior diagnostic evaluations inspected these boards, although none were used for training or epoch selection',
  'Candidate rollouts have identical root policy and simulations, but the corrected ONNX changes MCTS leaf values',
  'The original Sigma2 worker is user-modified in the pre-existing worktree',
  'Warm worker timing excludes startup, network and server overhead; no strict move deadline demonstrated']};
audit.gates['500msStrict']=variants.corrected.latency.over500===0;
writeFileSync('evaluation/sigma4-value-research-onnx-matched-audit-20261106.json',JSON.stringify(audit,null,2)+'\n');
console.log('PASS MATCH AUDIT',JSON.stringify({variants,totals:audit.totals,gates:audit.gates}));
