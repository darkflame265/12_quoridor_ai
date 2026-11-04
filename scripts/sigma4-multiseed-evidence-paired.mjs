import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import assert from 'node:assert/strict';
import {legal} from '../src/engine.js';
const source=JSON.parse(readFileSync('evaluation/sigma4-research-mined.json','utf8'));
const trials=JSON.parse(readFileSync('evaluation/sigma4-repeated-branches-paired.json','utf8'));
const original=JSON.parse(readFileSync('evaluation/sigma4-counterfactual-trials.json','utf8'));
const roots=new Map(source.candidateBranches.map(r=>[r.id,r]));
const groups=new Map();
for(const t of trials.trials){
 const r=roots.get(t.id);
 assert.ok(r&&r.split==='train');
 assert.equal(t.rootKey,r.rootKey);
 assert.ok(legal(r.rootState,t.forcedAction));
 assert.deepEqual(t.forcedAction,r.forcedActions[t.choice]);
 assert.equal(t.cutoff,false);
 const key=t.id;
 if(!groups.has(key))groups.set(key,{root:r,seeds:new Map()});
 const entry=groups.get(key);
 if(!entry.seeds.has(t.seed))entry.seeds.set(t.seed,[]);
 entry.seeds.get(t.seed).push(t);
}
const cases=[];
for(const [id,group] of groups){
 const pairs=[];
 for(const [seed,rows] of group.seeds){
  if(rows.length!==2)continue;
  const base=rows.find(x=>x.choice===0),alt=rows.find(x=>x.choice===1);
  assert.ok(base&&alt);
  pairs.push({seed,baseWin:base.rootWon,alternativeWin:alt.rootWon,
    delta:Number(alt.rootWon)-Number(base.rootWon),sameContinuation:base.sequenceHash===alt.sequenceHash,
    baseHash:base.sequenceHash,altHash:alt.sequenceHash});
 }
 const positive=pairs.filter(p=>p.delta>0).length,negative=pairs.filter(p=>p.delta<0).length,tied=pairs.filter(p=>p.delta===0).length;
 const unique=new Set(pairs.flatMap(p=>[p.baseHash,p.altHash])).size;
 const old=original.trials.filter(x=>x.id===id);
 cases.push({id,split:group.root.split,originalSingleSeedOutcomes:old.map(x=>({choice:x.choice,won:x.rootWon})),
  pairedSeeds:pairs.length,positive,negative,tied,meanDelta:pairs.length?pairs.reduce((n,p)=>n+p.delta,0)/pairs.length:null,
  uniqueContinuations:unique,pairs});
}
const newOpenings=existsSync('evaluation/sigma4-research-extended-games.json')?JSON.parse(readFileSync('evaluation/sigma4-research-extended-games.json','utf8')):null;
const selfplay=existsSync('evaluation/sigma4-selfplay-games.json')?JSON.parse(readFileSync('evaluation/sigma4-selfplay-games.json','utf8')):null;const summary={version:'sigma4-multiseed-evidence-paired-v3',sourceFiles:['evaluation/sigma4-research-games.json','evaluation/sigma4-research-mined.json','evaluation/sigma4-repeated-branches-paired.json'],
 status:'research-only',repeatSettings:trials.settings,completedRepeatedTrials:trials.trials.length,plannedRepeatedTrials:trials.planned,
 repeatedUniqueContinuations:new Set(trials.trials.map(t=>t.sequenceHash)).size,matchedCaseCount:cases.length,
 cases,extendedOpenings:newOpenings?{games:newOpenings.games.length,distinctOpenings:new Set(newOpenings.games.map(g=>g.openingHash)).size,
  uniqueCompleteSequences:new Set(newOpenings.games.map(g=>g.sequenceHash)).size,sigma3Wins:newOpenings.games.filter(g=>g.sigma3Won).length}:null};
summary.selfplay=selfplay?{games:selfplay.games.length,distinctSequences:new Set(selfplay.games.map(g=>g.sequenceHash)).size,firstPlayerWins:selfplay.games.filter(g=>g.winner===0).length,secondPlayerWins:selfplay.games.filter(g=>g.winner===1).length}:null;summary.experimentalDeviations=trials.trials.reduce((n,t)=>n+(t.experimentalDeviations||0),0);summary.gates={allRepeatedGamesComplete:trials.trials.length===trials.planned,pairedSeeds:cases.every(c=>c.pairedSeeds===trials.settings.seedList.length),
 atLeastFiveIndependentSeedsPerRoot:cases.every(c=>c.pairedSeeds>=5),atLeast40VerifiedTrainingRoots:cases.length>=40,
 provenPositiveActionValue:cases.some(c=>c.pairedSeeds>=5&&c.positive>=4&&c.negative===0),
 independentHeldOutModels:false};
summary.canTrain=Object.values(summary.gates).every(Boolean);
summary.notes=['Same stochastic seed is paired across the forced actions, but downstream action distributions diverge; seed pairing is a control, not a minimax proof',
 'Single deterministic previous-trial outcomes are kept separate from stochastic evidence',
 'No production policy/value weights are changed; no Sigma4 agent has been promoted',
 'Small root and seed sample cannot establish improved strategy'];
writeFileSync('evaluation/sigma4-multiseed-evidence-paired.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify({status:summary.status,trials:summary.completedRepeatedTrials,unique:summary.repeatedUniqueContinuations,
 cases:cases.map(({id,pairedSeeds,positive,negative,tied,meanDelta,uniqueContinuations})=>({id,pairedSeeds,positive,negative,tied,meanDelta,uniqueContinuations})),
 extendedOpenings:summary.extendedOpenings,selfplay:summary.selfplay,canTrain:summary.canTrain},null,2));
