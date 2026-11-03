import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const source=JSON.parse(readFileSync('evaluation/sigma3-midgame-stress-audit.json','utf8')).positions.find(p=>p.id===33);
const f=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'))[33];
const report={version:'sigma3-midgame-fixture33-counterfactual-v1',fixture:33,phase:f.phase,conditions:{simulations:200,opponents:'sigma2 vs sigma2',sameSeeds:true,restarterPerGame:true},runs:[]};
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='1';
for(let seed=0;seed<3;seed++){
 for(const name of ['off','on']){
  const action=source[name].action;
  if(!legal(f.s,action))throw Error('illegal '+name);
  process.env.SIGMA_SEED=String(20261103+seed);
  let state=apply(clone(f.s),action),history=[...f.history.slice(-47),clone(f.s)],plies=0,trace=[];
  const players=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
  try{
   while(state.winner===null&&plies<130){
    const r=await players[state.turn].search({...state,historyStates:history.slice(-48)});
    if(!legal(state,r.pv[0]))throw Error('illegal reply');
    if(plies<12)trace.push({side:state.turn,action:r.pv[0]});
    history.push(clone(state));state=apply(state,r.pv[0]);plies++;
   }
   const result={seed,name,action,winner:state.winner,rootWon:state.winner===f.s.turn,cutoff:state.winner===null,plies,finalDistances:[distance(state,0),distance(state,1)],trace};
   report.runs.push(result);
   writeFileSync('evaluation/sigma3-midgame-fixture33-counterfactual.json',JSON.stringify(report,null,2));
   console.log('seed',seed,'branch',name,'rootWon',result.rootWon,'plies',plies,'cutoff',result.cutoff);
  }finally{await Promise.all(players.map(x=>x.close()))}
 }
}
