import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';

const read=p=>JSON.parse(readFileSync('evaluation/'+p,'utf8'));
const dossier=read('sigma4-028-040-counterfactual-20261105.json');
const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const deep=read('sigma4-unseen-wall-deep-20261105.json');
const sources=Object.fromEntries(bank.map(p=>[p.id,p]));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const expected=dossier.config.scenarios.length*dossier.config.opponents.length*dossier.config.arms.length*dossier.config.seeds.length;
assert.equal(expected,24);
assert.equal(dossier.games.length,expected,'not all games completed');
const byGroup=new Map();
for(const g of dossier.games){
 const b=sources[g.id];assert(b&&b.split==='development');
 const sc=dossier.config.scenarios.find(s=>s.id===g.id);
 assert(sc&&sc.positionId===b.positionId);
 assert(g.initialPlayer===b.state.turn);
 assert(g.totalPlies===g.actions.length);
 assert(g.totalPlies<=dossier.config.maxTotalPlies);
 assert(g.draw===false);
 assert.equal(g.currentPlayerWon,g.winner===b.state.turn);
 assert.equal(g.continuationPlies,g.actions.length-b.ply-1);
 assert.equal(sha(g.actions),g.actionsHash);
 assert.deepEqual(g.actions.slice(0,b.ply),b.actions);
 assert.deepEqual(g.actions[b.ply],g.forced);
 assert(legal(b.state,g.forced));
 const canonical=sc[g.arm==='original'?'originalAction':g.arm==='pawn'?'pawnAlternative':'wallAlternative'];
 assert.deepEqual(g.forced,canonical);
 let s=initial();
 for(const [i,a] of g.actions.entries()){assert(legal(s,a),'illegal action '+g.id+' '+i);s=apply(s,a);}
 assert.equal(s.winner,g.winner);
 const groupKey=[g.id,g.op,g.seed].join('/');
 if(!byGroup.has(groupKey))byGroup.set(groupKey,[]);
 byGroup.get(groupKey).push(g);
}
assert.equal(byGroup.size,8);
const comparisons=[];
for(const [key,group] of byGroup){
 assert.equal(group.length,3);
 const org=group.find(g=>g.arm==='original');
 assert(org);
 for(const alternative of group.filter(g=>g.arm!=='original')){
  assert.equal(alternative.seed,org.seed);
  assert.equal(alternative.op,org.op);
  assert.deepEqual(alternative.actions.slice(0,org.totalPlies-org.continuationPlies-1),org.actions.slice(0,org.totalPlies-org.continuationPlies-1));
  comparisons.push({id:org.id,opponent:org.op,seed:org.seed,arm:alternative.arm,
   originalWon:org.currentPlayerWon,alternativeWon:alternative.currentPlayerWon,
   winnerChanged:org.currentPlayerWon!==alternative.currentPlayerWon,
   improved:!org.currentPlayerWon&&alternative.currentPlayerWon,
   regressed:org.currentPlayerWon&&!alternative.currentPlayerWon,
   originalContinuation:org.continuationPlies,alternativeContinuation:alternative.continuationPlies});
 }
}
const groupStats={};
for(const id of dossier.config.scenarios.map(s=>s.id)){
 const comp=comparisons.filter(c=>c.id===id);
 groupStats[id]={comparisons:comp.length,improved:comp.filter(c=>c.improved).length,
 regressed:comp.filter(c=>c.regressed).length,
 byArm:Object.fromEntries(['pawn','wall'].map(arm=>[arm,{wins:comp.filter(c=>c.arm===arm&&c.alternativeWon).length,
 baselineWins:comp.filter(c=>c.arm===arm&&c.originalWon).length,improved:comp.filter(c=>c.arm===arm&&c.improved).length,
 regressed:comp.filter(c=>c.arm===arm&&c.regressed).length}]))};
}
const result={version:'sigma4-028-040-counterfactual-audit-v1',
 sourceHash:sha(dossier.config),games:dossier.games.length,
 pairedGroups:byGroup.size,pairedComparisons:comparisons.length,comparisons,
 groupStats,
 overall:{originalWins:dossier.games.filter(x=>x.arm==='original'&&x.currentPlayerWon).length,
 pawnWins:dossier.games.filter(x=>x.arm==='pawn'&&x.currentPlayerWon).length,
 wallWins:dossier.games.filter(x=>x.arm==='wall'&&x.currentPlayerWon).length,
 improved:comparisons.filter(c=>c.improved).length,
 regressed:comparisons.filter(c=>c.regressed).length,
 unchanged:comparisons.filter(c=>!c.winnerChanged).length},
 promotion:{modelTrainingApproved:false,productionEngineApproved:false,
 reason:'No proven minimax labels; two hand-selected development positions and repeated seeds cannot establish a general root policy advantage'},
 limitations:['Same full-game policy and original ONNX value head used in every branch',
 'Different forced first moves can lead to different later RNG consumption; same seed is only a controlled initial condition',
 'Two positions selected because of prior evaluation anomalies; not an unbiased holdout',
 'Observed game outcomes depend on two opponent policies; not a solved Quoridor game']};
writeFileSync('evaluation/sigma4-028-040-counterfactual-audit-20261105.json',JSON.stringify(result,null,2)+'\n');
console.log('PASS COUNTERFACTUAL AUDIT',JSON.stringify({games:result.games,pairedGroups:result.pairedGroups,
 groupStats:result.groupStats,overall:result.overall,promotion:result.promotion}));
