import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {apply,distance,legal} from '../src/engine.js';
const MIN={trainRoots:40,holdoutRoots:20,repliesPerAction:5};
const mined=JSON.parse(readFileSync('evaluation/sigma4-research-mined.json','utf8'));
const trials=JSON.parse(readFileSync('evaluation/sigma4-repeated-branches-paired.json','utf8'));
const byRoot=new Map(mined.candidateBranches.map(p=>[p.id,p]));
const byId=new Map();
for(const t of trials.trials){
 const row=byRoot.get(t.id);if(!row||t.rootKey!==row.rootKey)throw Error('root mismatch '+t.id);
 if(!byId.has(t.id))byId.set(t.id,{root:row,arms:[[],[]]});
 byId.get(t.id).arms[t.choice].push(t);
}
function features(row,action){
 const s=row.rootState,after=apply(s,action),side=row.side,opp=1-side;
 const visits=row.rootTop.find(x=>JSON.stringify(x.action)===JSON.stringify(action));
 const leader=row.rootTop[0];
 return [
  distance(s,side)-distance(after,side),
  distance(after,opp)-distance(s,opp),
  s.left[side]-after.left[side],
  s.left[opp]-after.left[opp],
  action.type==='wall'?1:0,
  Number.isFinite(visits?.qFromRoot)&&Number.isFinite(leader?.qFromRoot)?visits.qFromRoot-leader.qFromRoot:0,
  Math.log1p(visits?.visits||0)-Math.log1p(leader?.visits||0)
 ];
}
const samples=[];
for(const [id,entry] of byId){
 const {root,arms}=entry;
 if(arms.some(a=>a.length===0))continue;
 if(arms.flat().some(t=>t.cutoff))continue;
 if(!root.forcedActions.every(a=>legal(root.rootState,a)))throw Error('illegal action '+id);
 const uniqueArmCounts=arms.map(a=>new Set(a.map(t=>t.sequenceHash)).size);const rates=arms.map(a=>a.filter(t=>t.rootWon).length/a.length);
 const f0=features(root,root.forcedActions[0]),f1=features(root,root.forcedActions[1]);
 samples.push({id,split:root.split,openingHash:root.openingHash,armCounts:arms.map(x=>x.length),uniqueArmCounts,rates,
  delta:rates[1]-rates[0],features:f0.map((v,i)=>f1[i]-v)});
}
const train=samples.filter(s=>s.split==='train'),test=samples.filter(s=>s.split==='holdout');
const separation=new Set(train.map(s=>s.openingHash));
const disjoint=test.every(s=>!separation.has(s.openingHash));
const eligible=train.length>=MIN.trainRoots&&test.length>=MIN.holdoutRoots&&disjoint&&samples.every(s=>s.armCounts.every(n=>n>=MIN.repliesPerAction)&&s.uniqueArmCounts.every(n=>n>=MIN.repliesPerAction));
const report={version:'sigma4-counterfactual-pairwise-learner-paired-v3',status:eligible?'training':'blocked-insufficient-evidence',requirements:MIN,trainRoots:train.length,holdoutRoots:test.length,
 groupsDisjoint:disjoint,samples:samples.map(({features,...x})=>x),modelSaved:false,productionChanged:false,
 warning:'One deterministic rollout per action is NOT a reliable superiority label. A candidate must be trained on many verified grouped roots, then tested out-of-sample.'};
if(eligible){
 const labeled=train.filter(s=>Math.abs(s.delta)>=.2);
 if(labeled.length>=MIN.trainRoots*.7){
  const scale=[1,1,1,1,1,1,1],w=Array(7).fill(0);
  for(let epoch=0;epoch<350;epoch++){
   let grad=w.map(x=>.01*x);
   for(const sample of labeled){
    const y=sample.delta>0?1:0,x=sample.features.map((v,i)=>v/scale[i]);
    const z=w.reduce((sum,v,i)=>sum+v*x[i],0),p=1/(1+Math.exp(-Math.max(-20,Math.min(20,z))));
    for(let i=0;i<w.length;i++)grad[i]+=(p-y)*x[i]/labeled.length;
   }
   for(let i=0;i<w.length;i++)w[i]-=.055*grad[i];
  }
  const validated=test.map(s=>{const z=w.reduce((sum,v,i)=>sum+v*s.features[i]/scale[i],0);return {id:s.id,chosen:z>0?1:0,baselineRate:s.rates[0],predictedRate:s.rates[z>0?1:0]};});
  const improvement=validated.reduce((n,r)=>n+r.predictedRate-r.baselineRate,0);
  report.validation={positions:validated.length,totalRateDelta:improvement,choices:validated};
  if(improvement>0&&validated.length>=MIN.holdoutRoots){
   writeFileSync('evaluation/sigma4-policy-candidate.json',JSON.stringify({weights:w,features:['ownAdvance','opponentDelay','ownWallsSpent','enemyWallsSpent','wallAction','qDifference','logVisitsDifference'],source:'verified counterfactual training',status:'offline-only'},null,2));
   report.modelSaved=true;report.status='offline-candidate-only';
  }else report.status='rejected-holdout';
 }else report.status='blocked-insufficient-informative-pairs';
}
writeFileSync('evaluation/sigma4-policy-training-gate-paired.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,trainRoots:report.trainRoots,holdoutRoots:report.holdoutRoots,modelSaved:report.modelSaved},null,2));
