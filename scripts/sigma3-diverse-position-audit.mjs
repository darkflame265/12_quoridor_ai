import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const paths=[
'reports/sigma-selfplay/sigma2-wallvalue-trial-24.json',
'reports/sigma-selfplay/sigma2-wallvalue-trial-24-seed2.json',
'reports/sigma-selfplay/sigma2-seed20261102-baseline24.json',
'reports/sigma-selfplay/sigma2-threat-diverse4.json'];
const max=Number(process.argv.includes('--max')?process.argv[process.argv.indexOf('--max')+1]:100);
const stateKey=s=>JSON.stringify([s.p,s.walls,s.left,s.turn]);
const candidates=[],seen=new Set();
for(const file of paths){
 const report=JSON.parse(readFileSync(file));
 for(const game of report.completed??[])for(const step of game.trace??[]){
  const s=step.state;if(!s?.p||!s.walls||s.winner!==null)continue;
  const key=stateKey(s);if(seen.has(key))continue;seen.add(key);
  const walls=s.walls.length;
  const phase=walls<=5?'early':walls<=12?'middle':'late';
  const history=(game.trace??[]).filter(x=>x.ply<step.ply).slice(-48).map(x=>x.state);
  candidates.push({file,phase,s,history,ply:step.ply});
 }
}
const byPhase={early:[],middle:[],late:[]};
for(let i=0;i<candidates.length;i++)byPhase[candidates[i].phase].push(candidates[i]);
function pick(arr,count){const picked=[];for(let i=0;i<Math.min(count,arr.length);i++){const at=Math.floor(i*arr.length/Math.min(count,arr.length));picked.push(arr[at]);}return picked;}
const samples=[...pick(byPhase.early,Math.floor(max/3)),...pick(byPhase.middle,Math.floor(max/3)),...pick(byPhase.late,max-2*Math.floor(max/3))];
const special=JSON.parse(readFileSync('evaluation/turn21-f4-h8.json'));
let s=clone(special.baseState),history=[];
for(const a of special.records){history.push(clone(s));s=apply(s,a)}
samples.unshift({file:'evaluation/turn21-f4-h8.json',phase:'special',s,history,ply:special.records.length});
const report={sourceCounts:Object.fromEntries(Object.entries(byPhase).map(([k,v])=>[k,v.length])),requested:max,results:[]};
process.env.SIGMA_DIAGNOSTICS='1';process.env.SIGMA_EXPLORATION='0';
const agents=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma3'})];
try{
 for(const [i,item] of samples.entries()){
  const output={index:i,phase:item.phase,source:item.file,turn:item.s.turn,wallCount:item.s.walls.length,remaining:item.s.left,previousDistances:[distance(item.s,0),distance(item.s,1)]};
  for(const [j,variant] of ['sigma2','sigma3'].entries()){
   const result=await agents[j].search({...item.s,historyStates:item.history});
   const chosen=result.pv[0];if(!legal(item.s,chosen))throw Error('illegal '+variant+' '+i);
   const next=apply(item.s,chosen);
   output[variant]={chosen,elapsedMs:result.elapsedMs,afterDistances:[distance(next,0),distance(next,1)],corridor:result.diagnostics?.loopDebug?.sigma3Corridor??null,wallValue:result.diagnostics?.loopDebug?.wallValueCheck??null};
  }
  output.changed=JSON.stringify(output.sigma2.chosen)!==JSON.stringify(output.sigma3.chosen);
  report.results.push(output);
  writeFileSync('evaluation/sigma3-diverse-position-audit.json',JSON.stringify(report,null,2));
  if(i%10===0||output.changed)console.log(i+1,'/',samples.length,item.phase,'diff',output.changed,'sigma2',JSON.stringify(output.sigma2.chosen),'sigma3',JSON.stringify(output.sigma3.chosen),'ms',Math.round(output.sigma2.elapsedMs),Math.round(output.sigma3.elapsedMs));
 }
}finally{await Promise.all(agents.map(a=>a.close()))}
console.log('SUMMARY',JSON.stringify({tested:report.results.length,changed:report.results.filter(x=>x.changed).length,corridor:report.results.filter(x=>x.sigma3.corridor).length,phaseCounts:report.sourceCounts}));
