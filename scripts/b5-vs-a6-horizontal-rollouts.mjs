import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const src=JSON.parse(readFileSync('evaluation/turn32-b5-a5-top.json','utf8'));
let root=clone(src.baseState),prefix=[];
for(let i=0;i<31;i++){const a=src.records[i];if(!legal(root,a))throw Error('invalid prefix '+i);prefix.push(clone(root));root=apply(root,a);}
const branches=[['b5-pawn',{type:'move',x:1,y:4}],['a6-horizontal',{type:'wall',x:0,y:3,o:'h'}]];
const results={setup:{simulations:200,policy:'Sigma2 player1 vs Sigma2 player0',startingPly:32,seeds:10,maxPlies:100},runs:[]};
for(let i=0;i<10;i++)for(const [branch,first] of branches){
 process.env.SIGMA_SEED=String(20261103+i*7919);
 process.env.SIGMA_EXPLORATION='0.15';
 const agents=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 let s=apply(root,first),history=[...prefix,clone(root)],n=0,wallAttacks=0;const trace=[];
 try{
  while(s.winner===null&&n<100){
   let res=await agents[s.turn].search({...s,historyStates:history.slice(-48)});
   const move=res.pv?.[0];if(!move||!legal(s,move))throw Error('invalid AI '+branch+' seed '+i+' move '+n+JSON.stringify(move));
   if(n<8)trace.push({side:s.turn,move});
   if(s.turn===0&&move.type==='wall'){const x=apply(s,move);wallAttacks+=Math.max(0,distance(x,1)-distance(s,1));}
   history.push(clone(s));s=apply(s,move);n++;
  }
  let entry={seed:i,branch,winner:s.winner,cutoff:s.winner===null,plies:n,wallAttacks,finalDistances:[distance(s,0),distance(s,1)],finalWalls:s.left,trace};
  results.runs.push(entry);writeFileSync('evaluation/b5-vs-a6-horizontal-rollouts.json',JSON.stringify(results,null,2));
  console.log(i+1,branch,'winner',s.winner,'plies',n,'wallAttackDistanceAdded',wallAttacks);
 }finally{await Promise.all(agents.map(a=>a.close()));}
}
