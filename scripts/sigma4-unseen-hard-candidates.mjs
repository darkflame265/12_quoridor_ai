import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
const read=p=>JSON.parse(readFileSync('evaluation/'+p,'utf8'));
const rows=readFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl','utf8').trim().split('\n').map(JSON.parse);
const bank=Object.fromEntries(rows.map(r=>[r.id,r]));
const report=read('sigma4-unseen-wall-outcome-audit-20261105.json');
const deep=read('sigma4-unseen-wall-deep-20261105.json');
const top=read('sigma4-unseen-wall-800-review-20261105.json');
const detail=Object.fromEntries(deep.rows.map(r=>[r.id,r]));
const verify800=Object.fromEntries(top.results.map(r=>[r.id,r]));
const groups=new Map();
for(const obs of report.observations){
 if(!groups.has(obs.id))groups.set(obs.id,[]);
 groups.get(obs.id).push(obs);
}
const candidates=[];
for(const [id,obs] of groups){
 const p=bank[id];assert(p);
 assert.equal(obs.length,2);
 if(p.split!=='development')continue;
 if(obs[0].label!==obs[1].label)continue;
 if(obs[0].originalSquared<.5)continue;
 const d=detail[id],review=verify800[id];
 assert(d);
 let s=initial();
 for(const a of p.actions){assert(legal(s,a));s=apply(s,a);}
 assert.deepEqual(s,p.state);
 candidates.push({positionId:p.positionId,id,split:p.split,seed:p.seed,
  startingPly:p.ply,walls:p.wallCount,paths:{current:p.ownDistance,opponent:p.enemyDistance},
  state:p.state,fullPrefix:p.actions,
  observedOpponentResults:obs.map(r=>({opponent:r.opponent,winner:r.winner,actualCurrentPlayerWon:r.label})),
  empiricalWinOutcome:obs[0].label,
  originalNetworkValue:d.modelValue,
  originalPredictedWinProbability:obs[0].originalProbability,
  rootQ200:d.search200.rootQ,rootQ400:d.search400.rootQ,rootQ800:review?.q800??null,
  modelVsDeepDisagreement:d.modelVsSearchQ,
  labelQuality:'Two policy-conditioned game outcomes. NOT exact optimal-play proof; human adjudication/deeper game counterfactual needed before training'});
}
candidates.sort((a,b)=>Math.abs(b.modelVsDeepDisagreement)-Math.abs(a.modelVsDeepDisagreement));
assert.equal(candidates.length,2,'expect two independently selected high-error development candidates');
assert(candidates.every(x=>x.split==='development'));
writeFileSync('evaluation/sigma4-unseen-wall-hard-development-20261105.jsonl',candidates.map(x=>JSON.stringify(x)).join('\n')+'\n');
console.log('PASS HARD DEVELOPMENT CANDIDATES',JSON.stringify(candidates.map(x=>({
 id:x.id,empiricalWin:x.empiricalWinOutcome,
 modelP:x.originalPredictedWinProbability,q400:x.rootQ400,q800:x.rootQ800}))));
