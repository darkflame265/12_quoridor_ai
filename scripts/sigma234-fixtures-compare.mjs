import {initial,apply,legal,clone,distance} from '../src/engine.js';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {Sigma4Process} from '../server/sigma4-process.mjs';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
const pairs=[['sigma2','sigma3'],['sigma2','sigma4'],['sigma3','sigma4']];
const archived=JSON.parse(readFileSync('evaluation/sigma4-opening-diversity-games.json','utf8'));
const fixtures=[0,3].map((idx,k)=>({name:'archive-'+idx,actions:archived.games[idx].firstSixActions}));
if(JSON.stringify(fixtures[0].actions)===JSON.stringify(fixtures[1].actions))throw Error('fixtures identical');
const out='evaluation/sigma2-sigma3-sigma4-fixtures-20261105.json',hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const tasks=pairs.flatMap(([a,b])=>fixtures.flatMap(fixture=>[{a,b,fixture:fixture.name,left:a,right:b},{a,b,fixture:fixture.name,left:b,right:a}]));
const report={version:'sigma234-two-distinct-sixply-fixtures-v1',date:'2026-11-05',settings:{fixtures,pairs,maxPlies:200,swapSeats:true},planned:tasks.length,games:[]};
if(existsSync(out)){let prev=JSON.parse(readFileSync(out));if(prev.version!==report.version||JSON.stringify(prev.settings)!==JSON.stringify(report.settings))throw Error('resume mismatch');report.games=prev.games;}
const create=variant=>variant==='sigma4'?new Sigma4Process():new SigmaProcess({variant});
for(let idx=report.games.length;idx<tasks.length;idx++){
 const task=tasks[idx],fixture=fixtures.find(x=>x.name===task.fixture),agents=[create(task.left),create(task.right)];
 let s=initial();const history=[],actions=[],trace=[],timeMs=[0,0];
 for(const action of fixture.actions){
  if(!legal(s,action))throw Error('illegal archived fixture');
  actions.push(action);history.push(clone(s));s=apply(s,action);
 }
 if(s.winner!==null||s.turn!==0)throw Error('fixture must be live and even');
 const startHash=hash([s.p,s.walls,s.left,s.turn]);
 try{
  for(let ply=actions.length;ply<200&&s.winner===null;ply++){
   const side=s.turn,result=await agents[side].search({...s,historyStates:history.slice(-48).map(clone)});
   const action=result.pv?.[0];
   if(!action||!legal(s,action))throw Error('invalid engine action '+task.left+' '+task.right+' ply '+ply);
   timeMs[side]+=result.elapsedMs??0;
   trace.push({ply,side,engine:side===0?task.left:task.right,action,elapsedMs:result.elapsedMs,
    sigma4:result.sigma4??null,paths:[distance(s,0),distance(s,1)]});
   history.push(clone(s));actions.push(action);s=apply(s,action);
  }
  const game={...task,startingPositionHash:startHash,plies:actions.length,continuationPlies:trace.length,winner:s.winner,
   winnerEngine:s.winner===null?null:s.winner===0?task.left:task.right,cutoff:s.winner===null,
   hash:hash(actions),firstSixHash:hash(actions.slice(0,6)),times:timeMs,trace};
  report.games.push(game);writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  console.log('GAME',idx+1,'/',tasks.length,task.fixture,task.left,'vs',task.right,'winner',game.winnerEngine||'cutoff',
   'moves',game.plies,'unique',new Set(report.games.map(g=>g.hash)).size);
 }finally{await Promise.all(agents.map(a=>a.close()));}
}
console.log('SUMMARY',JSON.stringify(pairs.map(([a,b])=>{const v=report.games.filter(g=>g.a===a&&g.b===b);return {a,b,winsA:v.filter(g=>g.winnerEngine===a).length,winsB:v.filter(g=>g.winnerEngine===b).length,cutoffs:v.filter(g=>g.cutoff).length,unique:new Set(v.map(g=>g.hash)).size}})));
