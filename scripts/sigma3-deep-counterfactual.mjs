import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const audit=JSON.parse(readFileSync('evaluation/sigma3-diverse-deep-audit.json','utf8'));
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const cases=audit.positions.filter(r=>r.changed);
const report={version:'sigma3-deep-counterfactual-v1',method:'Two forced initial actions, then Sigma2-vs-Sigma2 200-simulation self-play; NOT proof of optimality',seed:20261103,exploration:0.15,results:[]};
for(const p of cases){
 const f=fixtures[p.id];
 for(const branch of ['baseline','deep']){
  const choice=p[branch].action;
  if(!legal(f.s,choice))throw Error('illegal candidate');
  process.env.SIGMA_EXPLORATION='0.15';
  process.env.SIGMA_SEED='20261103';
  process.env.SIGMA2_REUSE='1';
  process.env.SIGMA2_DETERMINISTIC='0';
  process.env.SIGMA3_RESEARCH_SIMS='0';
  let s=apply(clone(f.s),choice),history=[...f.history.slice(-47),clone(f.s)],plies=0,trace=[];
  const players=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
  try{
   while(s.winner===null&&plies<110){
    const response=await players[s.turn].search({...s,historyStates:history.slice(-48)});
    const action=response.pv[0];
    if(!legal(s,action))throw Error('illegal reply '+p.id+' '+branch+' '+plies);
    if(plies<14)trace.push({side:s.turn,action});
    history.push(clone(s));s=apply(s,action);plies++;
   }
   const rec={position:p.id,phase:p.phase,branch,choice,winner:s.winner,rootSide:f.s.turn,rootSideWon:s.winner===f.s.turn,plies,cutoff:s.winner===null,finalDistances:[distance(s,0),distance(s,1)],trace};
   report.results.push(rec);
   writeFileSync('evaluation/sigma3-deep-counterfactual-6.json',JSON.stringify(report,null,2));
   console.log('position',p.id,'branch',branch,'winner',s.winner,'rootWon',rec.rootSideWon,'plies',plies,'cutoff',rec.cutoff);
  }finally{await Promise.all(players.map(x=>x.close()))}
 }
}
console.log('SUMMARY',JSON.stringify(report.results.map(r=>({p:r.position,branch:r.branch,won:r.rootSideWon,cutoff:r.cutoff,plies:r.plies}))));
