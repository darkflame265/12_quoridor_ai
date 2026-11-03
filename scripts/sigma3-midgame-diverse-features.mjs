import{readFileSync,writeFileSync}from'node:fs';
import{clone,apply,legal,distance}from'../src/engine.js';
const source=JSON.parse(readFileSync('evaluation/sigma3-midgame-diverse-outcomes.json','utf8'));
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const audit=JSON.parse(readFileSync('evaluation/sigma3-midgame-stress-audit.json','utf8')).positions;
if(source.results.length!==source.games)throw Error('Incomplete rollouts: '+source.results.length+'/'+source.games);
const result={version:'sigma3-diverse-feature-set-v1',seedCount:2,featureNames:['bias','mctsQ','logVisits','ownDistGain','enemyDistIncrease','ownWalls','enemyWalls','wallFlag','plyFraction'],trainRootIds:[15,16,17,19,20,22,23,24],holdoutRootIds:[26,28,32,33],records:[],quality:{}};
const hashes=new Set(),variedSeeds=new Set();
for(const id of [...result.trainRootIds,...result.holdoutRootIds]){
 const f=fixtures[id],a=audit.find(r=>r.id===id);
 for(const choice of [0,1]){
  const action=a.off.visits[choice].action,rows=source.results.filter(r=>r.id===id&&r.choice===choice);
  if(rows.length!==2||new Set(rows.map(r=>r.seed)).size!==2)throw Error('missing paired seeds '+id+':'+choice);
  if(rows.some(r=>r.cutoff))throw Error('Unfinished game '+id+':'+choice);
  if(!legal(f.s,action))throw Error('illegal action');
  const side=f.s.turn,opposite=1-side,after=apply(clone(f.s),action);
  const fvec=[1,a.off.visits[choice].qFromRoot,Math.log1p(a.off.visits[choice].visits)/6,
   distance(f.s,side)-distance(after,side),
   distance(after,opposite)-distance(f.s,opposite),
   f.s.left[side]/10,f.s.left[opposite]/10,+(action.type==='wall'),Math.min(1,f.ply/100)];
  const uniqueHashes=new Set(rows.map(r=>r.sequenceHash));
  if(uniqueHashes.size>1)variedSeeds.add(id+':'+choice);
  for(const row of rows)hashes.add(row.sequenceHash);
  const winCount=rows.filter(r=>r.rootWon).length;
  const winRate=winCount/2;
  const smoothedRate=(winCount+1)/4;
  const tempo=rows.reduce((s,r)=>s+((120-r.plies)/120)*(r.rootWon?1:-1),0)/2;
  result.records.push({id,choice,action,features:fvec,winRate,smoothedRate,tempo,target:smoothedRate+0.025*tempo,
    seedResults:rows.map(r=>({seed:r.seed,win:r.rootWon,plies:r.plies,diverted:r.diverted,opportunities:r.opportunities,hash:r.sequenceHash}))});
 }
}
const differingWins=[...result.trainRootIds,...result.holdoutRootIds].filter(id=>{
 let a=result.records.find(r=>r.id===id&&r.choice===0),b=result.records.find(r=>r.id===id&&r.choice===1);
 return a.winRate!==b.winRate;
});
result.quality={uniqueFullContinuations:hashes.size,uniqueActionSeedPairContinuations:variedSeeds.size,totalActionPairs:24,
 distinctRootPositions:12,positionsWithCandidateWinRateDifference:differingWins,
 totalDiversions:source.results.reduce((a,r)=>a+r.diverted,0),
 cutoffs:source.results.filter(r=>r.cutoff).length,
 exactResultDuplicates:source.results.length-hashes.size};
writeFileSync('evaluation/sigma3-midgame-diverse-features.json',JSON.stringify(result,null,2));
console.log('QUALITY',JSON.stringify(result.quality));
