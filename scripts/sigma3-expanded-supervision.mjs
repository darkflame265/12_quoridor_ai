import{readFileSync,writeFileSync}from'node:fs';
import{clone,apply,legal,distance}from'../src/engine.js';
const prior=JSON.parse(readFileSync('evaluation/sigma3-midgame-diverse-features.json','utf8'));
const fresh=JSON.parse(readFileSync('evaluation/sigma3-midgame-independent-holdout-outcomes.json','utf8'));
const fixtures=Object.fromEntries(JSON.parse(readFileSync('evaluation/sigma3-independent-middle-fixtures.json','utf8')).map(f=>[f.id,f]));

if(fresh.results.length!==fresh.games||fresh.games!==24)throw Error('incomplete independent holdout');
if(fresh.results.some(r=>r.cutoff))throw Error('cutoffs in independent holdout');
const trainIds=[...prior.trainRootIds,...prior.holdoutRootIds].sort((a,b)=>a-b);
const holdoutIds=[25,27,29,34];
if(holdoutIds.some(id=>trainIds.includes(id)))throw Error('root leakage');
const records=prior.records.map(r=>({...r,source:'original-diverse-train'}));
const groups=[];
for(const id of holdoutIds){
 const f=fixtures[id],row={off:{visits:f.rootCandidates}};
 for(const choice of [0,1]){
  const action=row.off.visits[choice].action;
  if(!legal(f.s,action))throw Error('illegal action');
  const entries=fresh.results.filter(r=>r.id===id&&r.choice===choice);
  if(entries.length!==3||new Set(entries.map(r=>r.seed)).size!==3)throw Error('unpaired '+id+':'+choice);
  const after=apply(clone(f.s),action),me=f.s.turn,enemy=1-me;
  const features=[1,row.off.visits[choice].qFromRoot,
   Math.log1p(row.off.visits[choice].visits)/6,
   distance(f.s,me)-distance(after,me),
   distance(after,enemy)-distance(f.s,enemy),
   f.s.left[me]/10,f.s.left[enemy]/10,
   +(action.type==='wall'),Math.min(1,f.ply/100)];
  const wins=entries.filter(r=>r.rootWon).length;
  const smoothedRate=(wins+1)/(entries.length+2);
  const tempo=entries.reduce((sum,r)=>sum+((120-r.plies)/120)*(r.rootWon?1:-1),0)/entries.length;
  records.push({id,choice,action,features,winRate:wins/entries.length,
   smoothedRate,tempo,target:smoothedRate+0.025*tempo,
   seedResults:entries.map(r=>({seed:r.seed,win:r.rootWon,plies:r.plies,diverted:r.diverted,hash:r.sequenceHash})),
   source:'independent-holdout'});
 }
 const a=records.find(r=>r.id===id&&r.choice===0),b=records.find(r=>r.id===id&&r.choice===1);
 groups.push({id,winRate0:a.winRate,winRate1:b.winRate,changed:a.winRate!==b.winRate});
}
const result={version:'sigma3-expanded-supervision-v1',
 featureNames:prior.featureNames,trainRootIds:trainIds,holdoutRootIds:holdoutIds,
 records,quality:{trainRoots:trainIds.length,holdoutRoots:holdoutIds.length,
  trainSamples:trainIds.length*2,holdoutSamples:holdoutIds.length*2,
  holdoutRollouts:fresh.results.length,
  holdoutUniqueSequences:new Set(fresh.results.map(r=>r.sequenceHash)).size,
  holdoutDiversions:fresh.results.reduce((sum,r)=>sum+r.diverted,0),
  holdoutDifferentCandidateWinRates:groups.filter(g=>g.changed).map(g=>g.id),
  holdoutWinRatePairs:groups}};
writeFileSync('evaluation/sigma3-expanded-supervision.json',JSON.stringify(result,null,2));
console.log('QUALITY',JSON.stringify(result.quality));
