import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
const root='reports/sigma-selfplay/';
const pairs=[
 ['training','sigma2-reviewed-policy20.json','sigma2-cpuct08-20.json'],
 ['holdout','sigma2-baseline-holdout12.json','sigma2-cpuct08-holdout12.json']
];
const datasets=[];
for(const [label,baseline,improved] of pairs){
 const a=JSON.parse(readFileSync(root+baseline)),b=JSON.parse(readFileSync(root+improved));
 if(a.seed!==b.seed||a.completed.length!==b.completed.length||a.exploration!==b.exploration)throw Error('Unmatched datasets');
 const outcomes={baseline:{sigma2Wins:0,sigma1Wins:0,cutoffs:0},improved:{sigma2Wins:0,sigma1Wins:0,cutoffs:0}};
 const games=[];
 for(let i=0;i<a.completed.length;i++){
  const x=a.completed[i],y=b.completed[i],s2side=i%2===0?1:0;
  function outcome(g){return g.winner===null?'cutoff':g.winner===s2side?'sigma2':'sigma1';}
  const xa=outcome(x),yb=outcome(y);
  for(const [set,out] of [['baseline',xa],['improved',yb]])outcomes[set][out==='cutoff'?'cutoffs':out==='sigma2'?'sigma2Wins':'sigma1Wins']++;
  const firstDifference=x.trace.findIndex((t,j)=>JSON.stringify(t.action)!==JSON.stringify(y.trace[j]?.action));
  games.push({index:i,sigma2Side:s2side,baseline:xa,improved:yb,baselinePlies:x.plies,improvedPlies:y.plies,firstDifferentPly:firstDifference<0?null:firstDifference+1,baselineCutoff:x.cutoff?.fullPositionRevisits??null,improvedCutoff:y.cutoff?.fullPositionRevisits??null});
 }
 datasets.push({label,seed:a.seed,number:games.length,outcomes,games});
}
writeFileSync('evaluation/sigma2-cpuct08-paired-review.json',JSON.stringify({method:'identical start / seed / seat sequence; only Sigma2 cpuct varies',datasets},null,2)+'\n');
console.log(JSON.stringify(datasets.map(d=>({label:d.label,seed:d.seed,outcomes:d.outcomes,improvedWinFlips:d.games.filter(g=>g.baseline!=='sigma2'&&g.improved==='sigma2').length,degradedWinFlips:d.games.filter(g=>g.baseline==='sigma2'&&g.improved!=='sigma2').length})),null,2));
