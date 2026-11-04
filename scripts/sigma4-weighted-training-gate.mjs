import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal} from '../src/engine.js';
const read=x=>JSON.parse(readFileSync(x,'utf8'));
const naive=read('evaluation/sigma4-natural-opening-games.json');
const weighted=read('evaluation/sigma4-natural-weighted-games.json');
const early=read('evaluation/sigma4-opening-diversity-games.json');
const mined=read('evaluation/sigma4-weighted-mined.json');
const branches=read('evaluation/sigma4-weighted-counterfactual.json');
const sample=(doc,tag)=>{
 const seen=new Set(),prefix=new Set(),rootStates=new Set();
 for(const g of doc.games){
  assert.deepEqual(g.openingPrefix,[]);
  let state=initial();
  for(const [i,t] of g.trace.entries()){
   assert.equal(i,t.ply);assert.equal(JSON.stringify(state),JSON.stringify(t.state));
   assert.ok(legal(state,t.action));state=apply(state,t.action);
   rootStates.add(JSON.stringify([t.state.p,t.state.walls,t.state.left,t.state.turn]));
  }
  assert.equal(state.winner,g.winner);assert.equal(g.cutoff,false);
  seen.add(g.sequenceHash);prefix.add(g.firstSixHash);
 }
 return {tag,games:doc.games.length,distinctSequences:seen.size,distinctFirstSix:prefix.size,uniqueRootStates:rootStates.size,
  overrides:doc.games.reduce((n,g)=>n+(g.overrides||0),0)};
};
const summaries=[sample(naive,'native'),sample(weighted,'weighted'),sample(early,'annealed-early')];
const splits={train:new Set(mined.train.map(r=>r.stateKey)),holdout:new Set(mined.holdout.map(r=>r.stateKey))};
assert.ok([...splits.train].every(k=>!splits.holdout.has(k)));
const cases=[];
for(const id of [...new Set(branches.results.map(r=>r.id))]){
 const pairs=[];
 for(const seed of branches.settings.seeds){
  const sample=branches.results.filter(r=>r.id===id&&r.seed===seed);
  assert.equal(sample.length,2);assert.deepEqual(sample.map(r=>r.choice).sort(),[0,1]);
  assert.equal(sample[0].rootKey,sample[1].rootKey);
  assert.ok(sample.every(r=>!r.cutoff));
  pairs.push({seed,originalWon:sample[0].rootWon,alternativeWon:sample[1].rootWon,delta:Number(sample[1].rootWon)-Number(sample[0].rootWon)});
 }
 cases.push({id,seedPairs:pairs.length,improvements:pairs.filter(r=>r.delta>0).length,regressions:pairs.filter(r=>r.delta<0).length,identicalOutcome:pairs.filter(r=>r.delta===0).length,pairs});
}
const out={version:'sigma4-weighted-training-readiness-gate-v1',results:summaries,
 mined:{splitConflictStates:mined.summary.splitConflicts,trainStates:mined.summary.trainStates,
 holdoutStates:mined.summary.holdoutStates},
 branches:{games:branches.results.length,cases},
 gates:{allGamesCompleted:true,disjointPositionSets:true,improvesOpeningDiversity:early.games.length>=4&&summaries[2].distinctFirstSix>summaries[1].distinctFirstSix,
 verifiedStrongBranches:cases.length>=40&&cases.every(r=>r.seedPairs>=5&&r.improvements>=4&&r.regressions===0),
 trainHoldoutEvidenceEnough:mined.train.length>=40&&mined.holdout.length>=20,
 actualEnginePromotionTested:false},
 status:'research-only',modelTrained:false,productionPromoted:false,
 caveats:['Differences in full-game diversity between policies are not evidence of a stronger policy',
 'Branch continuations use experimentally sampled decisions, not proven best response',
 'Train and holdout were split by seed and overlapping board states were excluded, but natural early opening overlap persists']};
writeFileSync('evaluation/sigma4-weighted-training-gate.json',JSON.stringify(out,null,2)+'\n');
console.log('GATE',JSON.stringify({results:summaries,mined:out.mined,branches:cases.map(({pairs,...rest})=>rest),gates:out.gates},null,2));
