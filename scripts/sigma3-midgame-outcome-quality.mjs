import{readFileSync,writeFileSync}from'node:fs';
import{legal,apply,clone,distance}from'../src/engine.js';
const data=JSON.parse(readFileSync('evaluation/sigma3-midgame-outcome-rollouts.json','utf8'));
const review=JSON.parse(readFileSync('evaluation/sigma3-midgame-offline-value-review.json','utf8'));
const base=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const groups=new Map();
for(const r of data.results){
 const key=r.id+':'+r.choice;
 if(!groups.has(key))groups.set(key,[]);
 groups.get(key).push(r);
 if(!legal(base[r.id].s,r.action))throw Error('illegal root '+key);
 if(r.cutoff||r.winner===null)throw Error('unfinished '+key);
 if(r.rootWin===r.rootLoss)throw Error('bad winner '+key);
}
if(data.results.length!==32||groups.size!==16)throw Error('missing samples');
const states=[...new Set([...groups.keys()].map(k=>Number(k.split(':')[0])))];
let decisive=0,uniqueSeedOutcomes=0,seedDivergentPaths=0;
for(const id of states){
 const a=groups.get(id+':0'),b=groups.get(id+':1');
 if(a.length!==2||b.length!==2)throw Error('unpaired '+id);
 if(a.some((r,i)=>r.seed!==i)||b.some((r,i)=>r.seed!==i))throw Error('seed mismatch '+id);
 if(a[0].rootWin!==b[0].rootWin)decisive++;
 for(const g of [a,b]){
  if(g[0].rootWin!==g[1].rootWin)uniqueSeedOutcomes++;
  if(g[0].continuationPlies!==g[1].continuationPlies||JSON.stringify(g[0].trace)!==JSON.stringify(g[1].trace))seedDivergentPaths++;
 }
}
const val=review.holdout.map(r=>({...r,baselineMeanPlies:groups.get(r.id+':0').reduce((a,x)=>a+x.continuationPlies,0)/2,modelMeanPlies:groups.get(r.id+':'+r.modelChoice).reduce((a,x)=>a+x.continuationPlies,0)/2}));
review.qualityGate={originalRootPositions:states.length,forcedRootActions:16,continuations:32,rootGroupsWithDifferentWinLossLabels:decisive,seedGroupsWithDifferentWinLossLabels:uniqueSeedOutcomes,seedGroupsWithDifferentEarlyTraceOrLength:seedDivergentPaths,trainSetIndependentRootGroups:review.trainGroups.length,validationIndependentRootGroups:review.holdoutGroups.length,passesPromotionGate:false,reason:'No root pair alters winner and the deterministic continuation policy gave identical outcomes under both seed labels; held-out win-rate gain zero.'};
review.holdoutDetailed=val;
review.promoted=false;
writeFileSync('evaluation/sigma3-midgame-offline-value-review.json',JSON.stringify(review,null,2));
console.log(JSON.stringify({qualityGate:review.qualityGate,holdout:val},null,2));
