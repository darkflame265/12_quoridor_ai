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

const selected=[0,54,83].map(i=>({index:i,...samples[i]}));writeFileSync('evaluation/sigma3-changed-positions.json',JSON.stringify(selected,null,2));console.log('saved',selected.map(x=>[x.index,x.phase,x.s.walls.length,x.s.turn]));
