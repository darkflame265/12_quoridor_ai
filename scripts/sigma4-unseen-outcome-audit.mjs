import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';
const j=p=>JSON.parse(readFileSync('evaluation/'+p,'utf8'));
const bank=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const lookup=Object.fromEntries(bank.map(p=>[p.id,p]));
const deep=j('sigma4-unseen-wall-deep-20261105.json');
const earlierCalibration=j('sigma4-value-calibrator-prototype-20261105.json');
const oldDevelopmentP=j('sigma4-value-calibration-20261105.json').development.winRate;
const calibrate=p=>{const x=Math.log(Math.max(1e-6,Math.min(1-1e-6,p))/(1-Math.max(1e-6,Math.min(1-1e-6,p))));return 1/(1+Math.exp(-(earlierCalibration.logitScale*x+earlierCalibration.logitBias)));};
const ref=Object.fromEntries(deep.rows.map(r=>[r.id,r]));
const sets=[j('sigma4-unseen-wall-fullgame-20261105.json'),j('sigma4-unseen-wall-balanced-fullgame-20261105.json')];
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const observed=[],startSet=new Set();
for(const report of sets){
 assert.equal(report.games.length,16);
 assert.equal(report.config.starts.length,8);
 for(const g of report.games){
  const p=lookup[g.startId];assert(p);
  startSet.add(g.startId);
  assert(g.split===p.split);
  assert.deepEqual(g.actions.slice(0,p.actions.length),p.actions);
  assert(g.actions.length===g.totalPlies);
  assert(g.winner===0||g.winner===1);
  assert(!g.cutoff);
  assert(sha(g.actions)===g.fullMovesHash);
  let s=initial();
  for(const a of g.actions){assert(legal(s,a),'invalid game move '+g.startId);s=apply(s,a);}
  assert.equal(s.winner,g.winner);
  const r=ref[g.startId];assert(r);
  const label=Number(g.winner===p.state.turn);
  const pNN=(r.modelValue+1)/2,p400=(r.search400.rootQ+1)/2,calibrated=calibrate(pNN);
  observed.push({id:g.startId,split:g.split,opponent:g.opponent,winner:g.winner,
   currentMover:p.state.turn,candidateSide:g.candidateSide,label,
   wallCount:p.wallCount,ply:p.ply,pathGap:Math.abs(p.ownDistance-p.enemyDistance),
   originalProbability:pNN,search400Probability:p400,calibrationProbability:calibrated,
   originalSquared:(pNN-label)**2,searchSquared:(p400-label)**2,calibrationSquared:(calibrated-label)**2,priorConstantSquared:(oldDevelopmentP-label)**2});
 }
}
assert.equal(startSet.size,16);
assert.equal(observed.length,32);
const group=arr=>{
 assert(arr.length>0);
 const m=key=>arr.reduce((s,x)=>s+x[key],0)/arr.length;
 return {games:arr.length,uniqueStartPositions:new Set(arr.map(x=>x.id)).size,
  observedWinFraction:m('label'),meanNetworkProbability:m('originalProbability'),
  networkBrier:m('originalSquared'),deepSearchBrier:m('searchSquared'),priorPlattBrier:m('calibrationSquared'),priorConstantBrier:m('priorConstantSquared'),
  constantHalfBrier:arr.reduce((s,x)=>s+(.5-x.label)**2,0)/arr.length};
};
const dev=observed.filter(x=>x.split==='development');
const holdout=observed.filter(x=>x.split==='holdout');
assert.equal(dev.length,16);assert.equal(holdout.length,16);
const devRate=group(dev).observedWinFraction;
const baselineBrier=arr=>arr.reduce((sum,x)=>sum+(devRate-x.label)**2,0)/arr.length;
const contradictory=[...startSet].filter(id=>{
 const pairs=observed.filter(x=>x.id===id);
 return pairs.length!==2||pairs[0].label!==pairs[1].label;
});
const report={version:'sigma4-new-wallgame-outcome-analysis-v1',
 counts:{games:32,positions:16,balancedGamePositions:8,balancedGames:16,
  oldPriorOverlap:0,ambiguousObservedPositions:contradictory.length,contradictoryIds:contradictory},
 priorCalibration:{logitScale:earlierCalibration.logitScale,logitBias:earlierCalibration.logitBias,constantP:oldDevelopmentP},
 metrics:{all:group(observed),balanced:group(observed.filter(x=>x.pathGap<=1)),
 imbalanced:group(observed.filter(x=>x.pathGap>=2)),development:group(dev),holdout:group(holdout),
 holdoutConstantFromDevelopment:{probability:devRate,brier:baselineBrier(holdout)}},
 observations:observed,
 caveats:['Only 16 independent synthetic starting positions; each sampled against two correlated opponents',
  'The player to move at the bank starting position is player 0; candidate side may differ',
  '400-MCTS and network share same trained ONNX value head',
  'These are observed winner labels under a specific MCTS policy, not minimax ground truth',
  'Holdout outcome only used for evaluation; no new ONNX or probability calibration fitted'],
 trainingApproved:false,productionPromotionApproved:false};
writeFileSync('evaluation/sigma4-unseen-wall-outcome-audit-20261105.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS NEW OUTCOME AUDIT',JSON.stringify({counts:report.counts,metrics:report.metrics}));
