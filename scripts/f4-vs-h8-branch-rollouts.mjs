import {readFileSync,writeFileSync} from 'node:fs';
import {clone,apply,legal,distance} from '../src/engine.js';
import {SigmaProcess} from '../server/sigma-process.mjs';
const d=JSON.parse(readFileSync('evaluation/turn21-f4-h8.json','utf8'));let root=clone(d.baseState),past=[];
for(let i=0;i<d.records.length;i++){past.push(clone(root));root=apply(root,d.records[i]);}
const branches=[['f4-move',{type:'move',x:5,y:5}],['h8-vertical',{type:'wall',x:7,y:1,o:'v'}]];
const out={description:'paired position rollouts, Sigma2-vs-Sigma2, 200 MCTS simulations',results:[]};
for(let seed=0;seed<10;seed++)for(const [branch,choice] of branches){
 process.env.SIGMA_EXPLORATION='0.15';process.env.SIGMA_SEED=String(20261103+seed*1733);
 if(!legal(root,choice))throw Error(branch+' illegal');
 let s=apply(root,choice),history=[...past,clone(root)],n=0,wallDamage=0;let trace=[];
 const agents=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 try{
  while(s.winner===null&&n<130){
   const side=s.turn,resp=await agents[side].search({...s,historyStates:history.slice(-48)}),a=resp.pv?.[0];
   if(!a||!legal(s,a))throw Error('bad choice '+branch+' '+seed+' '+n+JSON.stringify(a));
   if(n<12)trace.push({side,a});
   const after=apply(s,a);
   if(side===1&&a.type==='wall')wallDamage+=Math.max(0,distance(after,0)-distance(s,0));
   history.push(clone(s));s=after;n++;
  }
  const record={seed,branch,winner:s.winner,plies:n,cutoff:s.winner===null,wallDamage,finalDist:[distance(s,0),distance(s,1)],finalWalls:s.left,trace};
  out.results.push(record);writeFileSync('evaluation/f4-vs-h8-branch-rollouts.json',JSON.stringify(out,null,2));
  console.log(seed+1,branch,'winner',record.winner,'plies',n,'wallDamage',wallDamage,'cutoff',record.cutoff);
 }finally{await Promise.all(agents.map(x=>x.close()));}
}