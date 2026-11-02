import {readFileSync,writeFileSync} from 'node:fs';
const cases=[
 {seed:20261213,baseline:'reports/sigma-selfplay/sigma2-cpuct080-12-control.json',trial:'reports/sigma-selfplay/sigma2-cpuct065-12.json'},
 {seed:20261221,baseline:'reports/sigma-selfplay/sigma2-cpuct080-holdout12.json',trial:'reports/sigma-selfplay/sigma2-cpuct065-holdout12.json'}
];
const analyze=gs=>{
 let wins=0,losses=0,cutoffs=0,revisits=0,plies=0;const details=[];
 for(const g of gs){
  const s2side=g.index%2===0?1:0;
  const outcome=g.winner===null?'cutoff':g.winner===s2side?'sigma2':'sigma1';
  if(outcome==='sigma2')wins++;else if(outcome==='sigma1')losses++;else cutoffs++;
  plies+=g.plies;
  let seen=new Set(),revisited=0;
  for(const step of g.trace){
   const s=step.state,key=JSON.stringify([s.p,s.walls,s.left,s.turn]);
   if(seen.has(key))revisited++;seen.add(key);
  }
  revisits+=revisited;
  details.push({index:g.index,sigma2side:s2side,outcome,plies:g.plies,revisits:revisited,hash:g.hash});
 }
 return {wins,losses,cutoffs,revisits,averagePlies:Number((plies/gs.length).toFixed(2)),uniqueGames:new Set(gs.map(g=>g.hash)).size,details};
};
const comparison=cases.map(c=>{
 const a=JSON.parse(readFileSync(c.baseline)),b=JSON.parse(readFileSync(c.trial));
 if(a.seed!==c.seed||b.seed!==c.seed||a.completed.length!==b.completed.length||a.gamesRequested!==b.gamesRequested)throw Error('Mismatch seed or games');
 const baseline=analyze(a.completed),trial=analyze(b.completed);
 return {seed:c.seed,baseline,trial,winDifference:trial.wins-baseline.wins,repeatDifference:trial.revisits-baseline.revisits};
});
const totals=comparison.reduce((v,c)=>{for(const k of ['wins','losses','cutoffs','revisits']){v.baseline[k]+=c.baseline[k];v.trial[k]+=c.trial[k]}return v},{baseline:{wins:0,losses:0,cutoffs:0,revisits:0},trial:{wins:0,losses:0,cutoffs:0,revisits:0}});
const result={method:'Same Sigma1 opponent, same seed and seat for each 12-game pair, Sigma2 c_puct 0.8 vs 0.65',comparison,totals,adoptTrial:totals.trial.wins>totals.baseline.wins+2&&totals.trial.revisits<=totals.baseline.revisits&&totals.trial.cutoffs<=totals.baseline.cutoffs};
writeFileSync('evaluation/sigma2-cpuct065-paired-review.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({totals,adoptTrial:result.adoptTrial,comparison:comparison.map(c=>({seed:c.seed,baseline:c.baseline.wins,trial:c.trial.wins,baselineRevisits:c.baseline.revisits,trialRevisits:c.trial.revisits}))},null,2));
