import {readFileSync,writeFileSync} from 'node:fs';
import {clone,apply,legal,distance} from '../src/engine.js';
import {SigmaProcess} from '../server/sigma-process.mjs';
const positions=JSON.parse(readFileSync('evaluation/sigma3-changed-positions.json','utf8'));
const comparisons=JSON.parse(readFileSync('evaluation/sigma3-diverse-position-audit.json','utf8')).results;
const choices=positions.filter(p=>p.index!==0);
const report={purpose:'Paired continuation of positions where Sigma3 changes action; Sigma2 on both sides after forced move; 200 simulations',runs:[]};
for(const pos of choices)for(let seed=0;seed<3;seed++)for(const variant of ['sigma2','sigma3']){
 process.env.SIGMA_SEED=String(20262117+seed*37);
 process.env.SIGMA_EXPLORATION='0.15';
 const chosen=comparisons[pos.index][variant].chosen;
 if(!legal(pos.s,chosen))throw Error('illegal initial action');
 let s=apply(pos.s,chosen),history=[...pos.history,clone(pos.s)],plies=0,trace=[];
 const agents=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 try{
  while(s.winner===null&&plies<110){
   const side=s.turn;
   const result=await agents[side].search({...s,historyStates:history.slice(-48)});
   const action=result.pv[0];if(!legal(s,action))throw Error('bad reply '+pos.index+' '+variant+' '+plies);
   if(plies<14)trace.push({side,action});
   history.push(clone(s));s=apply(s,action);plies++;
  }
  const item={positionIndex:pos.index,phase:pos.phase,seed,variant,first:chosen,winner:s.winner,player:pos.s.turn,success:s.winner===pos.s.turn,plies,cutoff:s.winner===null,finalDistances:[distance(s,0),distance(s,1)],trace};
  report.runs.push(item);
  writeFileSync('evaluation/sigma3-changed-branch-continuations.json',JSON.stringify(report,null,2));
  console.log('case',pos.index,'seed',seed+1,variant,'winner',item.winner,'success',item.success,'plies',plies,'cutoff',item.cutoff);
 }finally{await Promise.all(agents.map(x=>x.close()))}
}
