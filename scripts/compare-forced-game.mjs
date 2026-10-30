import fs from 'node:fs';
import path from 'node:path';
import {NativeProcess} from '../server/native-process.mjs';
import {apply,legal,moves,distance,notation,candidates} from '../src/engine.js';
const [input,output='reports/forced-game-comparison',depthArg='4',shortlistFile,capArg='2500']=process.argv.slice(2);
if(!input)throw Error('Usage: node scripts/compare-forced-game.mjs game.json output [depth]');
const game=JSON.parse(fs.readFileSync(input,'utf8')),depth=Number(depthArg),capMs=Number(capArg);
const shortlist=shortlistFile?JSON.parse(fs.readFileSync(shortlistFile,'utf8')).results:null;
const env={QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'};
const judges=[{name:'current',executable:path.resolve('.external/game7-baseline/pressure.exe'),profile:'candidate',env},{name:'reference',executable:path.resolve('.external/game7-baseline/reference.exe'),profile:'candidate'}];
const same=(a,b)=>notation(a)===notation(b);
fs.mkdirSync(output,{recursive:true});
let state=game.baseState;const past=[],results=[];
for(let i=0;i<game.records.length;i++){
 if([9,11,13,17,19].includes(i+1)){
  const p=new NativeProcess(judges[0]);let diagnostic;
  try{diagnostic=(await p.request({op:'defense',state,ms:2000},{timeoutMs:4000})).diagnostics;}finally{p.close();}
  const chosen=[game.records[i],...moves(state)];
  for(const c of [...(diagnostic?.candidates??[])].sort((a,b)=>a.line.arrivalMargin-b.line.arrivalMargin).slice(0,3))chosen.push(c.action);
  const enemy=game.records[i+1];if(enemy?.type==='wall')chosen.push({...enemy,o:enemy.o==='h'?'v':'h'});
  const bestWall=candidates(state).find(c=>c.a.type==='wall');if(bestWall)chosen.push(bestWall.a);
  let options=chosen.filter((a,j)=>legal(state,a)&&chosen.findIndex(b=>same(a,b))===j);
  if(shortlist){
   const prior=shortlist.find(e=>e.ply===i+1);
   const ranked=[...prior.options].filter(r=>r.judges.every(j=>j.depth===j.requestedDepth)).sort((a,b)=>b.judges.reduce((v,j)=>v+j.scoreForUser,0)-a.judges.reduce((v,j)=>v+j.scoreForUser,0));
   options=options.filter(a=>same(a,game.records[i])||ranked.slice(0,2).some(r=>same(r.action,a)));
  }
  const entry={ply:i+1,state,actual:game.records[i],diagnostic,options:[]};
  for(const action of options){
   const child=apply(state,action),row={action,label:notation(action),actual:same(action,game.records[i]),distances:[distance(child,0),distance(child,1)],judges:[]};
   for(const judge of judges){
    const process=new NativeProcess(judge);
    try{const r=await process.search(child,{ms:capMs,cores:1,maxDepth:depth});row.judges.push({judge:judge.name,depth:r.depth,requestedDepth:depth,scoreForUser:-r.score,elapsedMs:r.elapsedMs,pv:r.pv,legal:!r.pv.length||legal(child,r.pv[0])});}finally{process.close();}
   }
   entry.options.push(row);
  }
  results.push(entry);fs.writeFileSync(path.join(output,'comparison.json'),JSON.stringify({input:path.basename(input),depth,cores:1,capMs,baseline:JSON.parse(fs.readFileSync('.external/game7-baseline/identity.json','utf8')),caveat:'Selective candidate comparison. Shared search ancestry; not independent proof or win probability.',results},null,2));
  console.log(JSON.stringify({ply:i+1,options:entry.options.map(r=>({a:r.label,actual:r.actual,judge:r.judges.map(j=>[j.judge,j.depth,j.scoreForUser])}))}));
 }
 past.push(state);state=apply(state,game.records[i]);
}
