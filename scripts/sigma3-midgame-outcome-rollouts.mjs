import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const audit=JSON.parse(readFileSync('evaluation/sigma3-midgame-stress-audit.json','utf8')).positions;
const selected=[15,16,17,19,24,26,32,33];
const dest='evaluation/sigma3-midgame-outcome-rollouts.json';
const tasks=[];
for(const id of selected){
 const f=fixtures[id],a=audit.find(v=>v.id===id);
 const rank=a.off.visits.slice(0,2);
 for(let seed=0;seed<2;seed++){
  for(let choice=0;choice<2;choice++){
   const action=rank[choice].action;
   if(!legal(f.s,action))throw Error('illegal '+id);
   tasks.push({id,seed,choice,action,visits:rank[choice].visits,rootQ:rank[choice].qFromRoot??null,rootSide:f.s.turn,phase:f.phase,ply:f.ply});
  }
 }
}
const report={version:'sigma3-midgame-outcome-rollouts-v1',seedBase:20261103,source:'evaluation/sigma3-diverse-match-fixtures.json',design:'8 distinct root positions, 2 MCTS top actions, 2 nominal deterministic seeds each, Sigma2 vs Sigma2 after forced action, fresh workers per candidate',tasks:tasks.length,results:[]};
if(existsSync(dest)){
 const old=JSON.parse(readFileSync(dest,'utf8'));
 if(old.version!==report.version||old.tasks!==tasks.length)throw Error('incompatible resume');
 report.results=old.results;
}
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='1';
process.env.SIGMA3_FOCUS='0';
async function playTask(i){
 const t=tasks[i],f=fixtures[t.id];
 // Baseline workers run deterministic search: seed labels here are not independent samples.
 let state=apply(clone(f.s),t.action),history=[...f.history.slice(-47),clone(f.s)],plies=0,trace=[];
 const players=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 try{
  while(state.winner===null&&plies<130){
   const res=await players[state.turn].search({...state,historyStates:history.slice(-48)});
   if(!legal(state,res.pv?.[0]))throw Error('illegal continuation '+i+' '+plies);
   if(plies<6)trace.push({side:state.turn,action:res.pv[0]});
   history.push(clone(state));state=apply(state,res.pv[0]);plies++;
  }
  const r={...t,rootWin:state.winner===t.rootSide,rootLoss:state.winner===1-t.rootSide,cutoff:state.winner===null,winner:state.winner,continuationPlies:plies,finalDistances:[distance(state,0),distance(state,1)],trace};
  console.log('rollout',i+1,'/',tasks.length,'pos',t.id,'choice',t.choice,'seed',t.seed,'win',r.rootWin,'plies',plies,'cutoff',r.cutoff);
  return r;
 }finally{await Promise.all(players.map(p=>p.close()))}
}
for(let i=report.results.length;i<tasks.length;i+=4){
 const indexes=Array.from({length:Math.min(4,tasks.length-i)},(_,j)=>i+j);
 const rows=await Promise.all(indexes.map(playTask));
 report.results.push(...rows);
 writeFileSync(dest,JSON.stringify(report,null,2));
}
const grouped=selected.map(id=>({id,choices:[0,1].map(choice=>{let arr=report.results.filter(r=>r.id===id&&r.choice===choice);return {choice,wins:arr.filter(r=>r.rootWin).length,plies:arr.map(r=>r.continuationPlies)}})}));
console.log('SUMMARY',JSON.stringify(grouped));
