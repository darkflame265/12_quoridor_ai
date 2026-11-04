import{readFileSync,writeFileSync}from'node:fs';
import{distance,clone,apply,legal}from'../src/engine.js';
const source=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8'));
const outcomes=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-outcomes.json','utf8'));
if(outcomes.results.length!==32)throw Error('incomplete 32 outcomes');
const featureNames=['bias','mctsQ','logVisits','ownDistGain','enemyDistIncrease','ownWalls','enemyWalls','wallFlag','plyFraction'];
const records=[];
for(const f of source){
 for(const choice of [0,1]){
  const c=f.rootCandidates[choice],action=c.action;
  if(!legal(f.s,action))throw Error('illegal action '+f.id);
  const me=f.s.turn,opp=1-me,after=apply(clone(f.s),action);
  const features=[1,c.qFromRoot,Math.log1p(c.visits)/6,
   distance(f.s,me)-distance(after,me),
   distance(after,opp)-distance(f.s,opp),
   f.s.left[me]/10,f.s.left[opp]/10,+(action.type==='wall'),Math.min(1,f.ply/100)];
  const rows=outcomes.results.filter(r=>r.id===f.id&&r.choice===choice);
  if(rows.length!==2||rows.some(r=>r.cutoff))throw Error('incomplete '+f.id+':'+choice);
  const wins=rows.filter(r=>r.win).length;
  records.push({id:f.id,choice,features,action,winRate:wins/2,
   seedResults:rows.map(r=>({seed:r.seed,win:r.win,plies:r.plies,diverted:r.diverted,hash:r.sequenceHash}))});
 }
}
const report={version:'sigma3-unseen-middle-features-v1',featureNames,records,
 rootIds:source.map(f=>f.id),outcomes:outcomes.results.length,
 uniqueSequences:new Set(outcomes.results.map(r=>r.sequenceHash)).size,
 totalDiversions:outcomes.results.reduce((a,r)=>a+r.diverted,0)};
writeFileSync('evaluation/sigma3-unseen-middle-features.json',JSON.stringify(report,null,2));
console.log('FEATURES',records.length,'unique',report.uniqueSequences);
