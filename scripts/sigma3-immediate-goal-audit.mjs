import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,moves,validWall,distance} from '../src/engine.js';
const files=['reports/sigma-selfplay/sigma2-wallvalue-trial-24.json','reports/sigma-selfplay/sigma2-wallvalue-trial-24-seed2.json','reports/sigma-selfplay/sigma2-seed20261102-baseline24.json','reports/sigma-selfplay/sigma2-threat-diverse4.json'];
const rootActions=s=>{let a=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(let o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))a.push(w);}return a};
const immediateEnemyGoal=(s,a)=>{let next=apply(s,a),enemy=1-s.turn;return next.winner===enemy||next.winner===null&&moves(next).some(reply=>apply(next,reply).winner===enemy);};
const found=[],seen=new Set();
for(const file of files)for(const g of JSON.parse(readFileSync(file)).completed||[]){
 for(let i=0;i<g.trace.length;i++){
  const step=g.trace[i],s=step.state;if(s.winner!==null||s.left[s.turn]<1||distance(s,1-s.turn)>2)continue;
  const key=JSON.stringify([s.p,s.walls,s.left,s.turn]);if(seen.has(key))continue;seen.add(key);
  const all=rootActions(s),risky=all.filter(a=>immediateEnemyGoal(s,a)),safe=all.filter(a=>!immediateEnemyGoal(s,a));
  if(!risky.length||!safe.length)continue;
  const past=g.trace.slice(0,i).slice(-48).map(x=>clone(x.state));
  found.push({file,past,s,ratio:risky.length+'/'+all.length,safeActions:safe.length});
 }
}
const sample=found.filter((v,i)=>i%Math.max(1,Math.floor(found.length/30))===0).slice(0,30);
console.log('candidate positions',found.length,'sample',sample.length);
process.env.SIGMA_DIAGNOSTICS='1';process.env.SIGMA_EXPLORATION='0';
const engines=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma3'})],results=[];
try{for(const [i,item] of sample.entries()){
 const row={index:i,file:item.file,position:item.s.p,turn:item.s.turn,riskyRatio:item.ratio};
 for(const [j,name] of ['sigma2','sigma3'].entries()){
  const r=await engines[j].search({...item.s,historyStates:item.past});
  const a=r.pv[0];if(!legal(item.s,a))throw Error('illegal '+name+' '+i);
  row[name]={action:a,allowsImmediateEnemyGoal:immediateEnemyGoal(item.s,a),tacticalGuard:r.diagnostics?.loopDebug?.sigma3ImmediateGoalDefense??null,elapsedMs:r.elapsedMs};
 }
 results.push(row);writeFileSync('evaluation/sigma3-immediate-goal-audit.json',JSON.stringify({candidatePositions:found.length,results},null,2));
 if(i%5===0||row.sigma2.allowsImmediateEnemyGoal!==row.sigma3.allowsImmediateEnemyGoal||row.sigma3.tacticalGuard)console.log(i+1,'/',sample.length,JSON.stringify(row).slice(0,550));
}}finally{await Promise.all(engines.map(e=>e.close()));}
