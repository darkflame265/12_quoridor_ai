import {initial,apply,legal,clone,distance} from '../src/engine.js';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {Sigma4Process} from '../server/sigma4-process.mjs';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync,existsSync} from 'node:fs';
const engines=['sigma2','sigma3','sigma4'],pairs=[['sigma2','sigma3'],['sigma2','sigma4'],['sigma3','sigma4']];
const seeds=[27017,27031],out='evaluation/sigma2-sigma3-sigma4-direct-20261105.json';
const tasks=pairs.flatMap(([a,b])=>seeds.flatMap(seed=>[{a,b,seed,left:a,right:b},{a,b,seed,left:b,right:a}]));
const hash=v=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
const report={version:'three-sigma-current-deployed-head-to-head-v1',created:'2026-11-05',
 settings:{pairs,seeds,simulations:200,maxPlies:200,startingPosition:'9x9 no walls',seatSwapped:true,workers:'deployed SigmaProcess and Sigma4Process',note:'Sigma4 uses its deployed deterministic position-key sampling; Sigma2/3 use current local workers'},planned:tasks.length,games:[]};
if(existsSync(out)){const prev=JSON.parse(readFileSync(out,'utf8'));if(prev.version!==report.version||JSON.stringify(prev.settings)!==JSON.stringify(report.settings))throw Error('resume settings mismatch');report.games=prev.games;}
const factory=x=>x==='sigma4'?new Sigma4Process():new SigmaProcess({variant:x});
for(let i=report.games.length;i<tasks.length;i++){
 const task=tasks[i],agents=[factory(task.left),factory(task.right)],time=[0,0],history=[],actions=[],trace=[];
 let state=initial();
 try{
  for(let ply=0;ply<200&&state.winner===null;ply++){
   const player=state.turn;
   const result=await agents[player].search({...state,historyStates:history.slice(-48).map(x=>clone(x))});
   const action=result.pv?.[0];if(!action||!legal(state,action))throw Error('illegal '+task.left+'/'+task.right+' ply '+ply);
   const next=apply(state,action);
   trace.push({ply,engine:player===0?task.left:task.right,side:player,
     move:action,paths:[distance(state,0),distance(state,1)],
     timeMs:result.elapsedMs,sigma4:result.sigma4??null});
   time[player]+=result.elapsedMs??0;actions.push(action);history.push(clone(state));state=next;
  }
  const winnerEngine=state.winner===null?null:state.winner===0?task.left:task.right;
  const game={...task,index:i+1,plies:actions.length,winner:state.winner,winnerEngine,cutoff:state.winner===null,
    timeMs:time,first6Hash:hash(actions.slice(0,6)),sequenceHash:hash(actions),trace};
  report.games.push(game);writeFileSync(out,JSON.stringify(report,null,2)+'\n');
  const thisPair=report.games.filter(g=>g.a===task.a&&g.b===task.b);
  console.log('GAME',i+1,'/',tasks.length,task.left,'vs',task.right,'winner',winnerEngine||'cutoff','plies',game.plies,
   'pair',thisPair.filter(g=>g.winnerEngine===task.a).length+'-'+thisPair.filter(g=>g.winnerEngine===task.b).length,
   'unique',new Set(report.games.map(g=>g.sequenceHash)).size);
 }finally{await Promise.all(agents.map(agent=>agent.close()));}
}
console.log('FINISHED',JSON.stringify(pairs.map(([a,b])=>{const v=report.games.filter(g=>g.a===a&&g.b===b);return {pair:a+' vs '+b,games:v.length,[a]:v.filter(g=>g.winnerEngine===a).length,[b]:v.filter(g=>g.winnerEngine===b).length,cutoffs:v.filter(g=>g.cutoff).length,unique:new Set(v.map(g=>g.sequenceHash)).size}})));
