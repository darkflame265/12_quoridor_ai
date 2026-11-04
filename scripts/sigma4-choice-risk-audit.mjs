import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const batches=[
 {name:'prior',path:'evaluation/sigma4-vs-sigma3-expanded.json'},
 {name:'holdout',path:'evaluation/sigma4-vs-sigma3-holdout.json'}
];
const summary=[];
for(const batch of batches){
 const d=JSON.parse(readFileSync(batch.path,'utf8'));
 const outcomes=[];
 for(const g of d.games){
  let changed=0,lowerQuality=0,rootSampleFound=0,unmatched=0,largeDrop=0,earlyChanges=0,earlyMajorDrop=0,
   visitRatios=[],qDrops=[],wallSelections=0;
  for(const t of g.trace){
   if(t.side!==g.sigma3Side)continue;
   const root=t.rootCandidates||[];
   const leader=root[0];
   if(!leader)continue;
   const match=root.find(c=>JSON.stringify(c.action)===JSON.stringify(t.action));
   if(!match){unmatched++;continue;}
   rootSampleFound++;
   const delta=leader.qFromRoot-match.qFromRoot;
   const vRatio=match.visits/Math.max(leader.visits,1);
   if(delta>1e-8){lowerQuality++;}
   if(delta>=.08){largeDrop++;if(t.ply<24)earlyMajorDrop++;}
   if(JSON.stringify(leader.action)!==JSON.stringify(t.action)){
    changed++;if(t.ply<24)earlyChanges++;
    qDrops.push(delta);visitRatios.push(vRatio);
    if(t.action.type==='wall')wallSelections++;
   }
  }
  outcomes.push({seed:g.seed,side:g.sigma3Side,candidateWon:g.candidateWon,plies:g.plies,changed,
   qDropMean:qDrops.length?qDrops.reduce((a,b)=>a+b,0)/qDrops.length:0,
   minVisitRatio:visitRatios.length?Math.min(...visitRatios):null,
   lowerQuality,largeDrop,earlyChanges,earlyMajorDrop,wallSelections,
   candidateChoiceNotFoundInTopSix:unmatched,found:rootSampleFound,
   sequenceHash:g.sequenceHash});
 }
 const win=outcomes.filter(o=>o.candidateWon),loss=outcomes.filter(o=>!o.candidateWon);
 const mean=(rows,key)=>rows.length?rows.reduce((n,r)=>n+r[key],0)/rows.length:null;
 summary.push({name:batch.name,games:d.games.length,distinctGames:new Set(d.games.map(g=>g.sequenceHash)).size,
  recordedChoices:outcomes.reduce((n,x)=>n+x.found,0),
  outcomes,group:{win:{games:win.length,meanChanges:mean(win,'changed'),meanLargeQDrops:mean(win,'largeDrop'),meanEarlyChanges:mean(win,'earlyChanges')},
   loss:{games:loss.length,meanChanges:mean(loss,'changed'),meanLargeQDrops:mean(loss,'largeDrop'),meanEarlyChanges:mean(loss,'earlyChanges')}},
  uncertainties:['Root candidate diagnostics contain only top six visit-ranked actions','Q values are estimated and root action ranking is by visits, not necessarily Q','Outcome association does not imply per-move causal effect']});
}
const output={version:'sigma4-candidate-root-risk-audit-v1',summary,
 hypotheses:['Compare a conservative candidate that allows only near-equal root-Q choices and substantial visit support',
  'Avoid inferring a strong policy from increased diversity alone','Require independent held-out games before updating candidate policy or production engine']};
writeFileSync('evaluation/sigma4-choice-risk-audit.json',JSON.stringify(output,null,2)+'\n');
console.log(JSON.stringify(output.summary.map(({name,games,distinctGames,group})=>({name,games,distinctGames,group})),null,2));
