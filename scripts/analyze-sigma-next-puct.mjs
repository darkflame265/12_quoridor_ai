import {readFileSync,writeFileSync} from 'node:fs';
const groups=[
 {seed:20261229,refs:[['0.8','reports/sigma-selfplay/sigma2-cpuct080-20261229.json'],['0.75','reports/sigma-selfplay/sigma2-cpuct075-12.json'],['0.95','reports/sigma-selfplay/sigma2-cpuct095-12.json']]},
 {seed:20261221,refs:[['0.8','reports/sigma-selfplay/sigma2-cpuct080-holdout12.json'],['0.75','reports/sigma-selfplay/sigma2-cpuct075-holdout12.json']]}
];
const count=(r)=>{
 let wins=0,losses=0,cutoffs=0,revisits=0;const details=[];
 for(const g of r.completed){
  const side=g.index%2===0?1:0;
  const outcome=g.winner===null?'cutoff':g.winner===side?'sigma2':'sigma1';
  if(outcome==='sigma2')wins++;else if(outcome==='sigma1')losses++;else cutoffs++;
  const seen=new Set();let revisited=0;
  for(const t of g.trace){const s=t.state,k=JSON.stringify([s.p,s.walls,s.left,s.turn]);if(seen.has(k))revisited++;seen.add(k);}
  revisits+=revisited;details.push({game:g.index,outcome,plies:g.plies,revisits:revisited});
 }
 return {wins,losses,cutoffs,revisits,details};
};
const analyzed=groups.map(g=>({seed:g.seed,policies:g.refs.map(([cpuct,path])=>{const r=JSON.parse(readFileSync(path));if(r.seed!==g.seed||r.completed.length!==12)throw Error('Incorrect sample');return {cpuct,...count(r)};})}));
const totals={};
for(const g of analyzed)for(const p of g.policies){const x=totals[p.cpuct]??={wins:0,losses:0,cutoffs:0,revisits:0,games:0};for(const k of ['wins','losses','cutoffs','revisits'])x[k]+=p[k];x.games+=12;}
const report={description:'Sigma2 200 PUCT simulations, Sigma1 fixed, same seed/seat within each group; cutoff is not a draw',groups:analyzed,totals,decision:'Retain default 0.8. Neither 0.75 nor 0.95 demonstrates greater win count and cycle robustness over matched tests.'};
writeFileSync('evaluation/sigma2-puct-next-trials.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(totals,null,2));
