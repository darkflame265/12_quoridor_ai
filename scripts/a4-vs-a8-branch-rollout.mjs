import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const src=JSON.parse(readFileSync('evaluation/turn18-choice.json','utf8'));
let root=clone(src.baseState);const prefix=[];
for(const a of src.records){if(!legal(root,a))throw Error('Invalid record');prefix.push(clone(root));root=apply(root,a);}
const branches=[['a4-jump',{type:'move',x:0,y:5}],['a8-vertical-wall',{type:'wall',x:0,y:1,o:'v'}]];
const out={description:'Matched counterfactuals, Sigma2 on both sides, 200 simulations, 0.15 exploration, 10 seeds, up to 140 additional half-moves, no winner -> cutoff',start:{p:root.p,walls:root.walls,left:root.left,turn:root.turn},runs:[]};
for(let seedIndex=0;seedIndex<10;seedIndex++){
 for(const [branch,first] of branches){
  if(!legal(root,first))throw Error('illegal branch');
  process.env.SIGMA_SEED=String(20261120+seedIndex*101);
  process.env.SIGMA_EXPLORATION='0.15';
  const engines=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
  const history=[...prefix,clone(root)];let s=apply(root,first),plies=0;const trace=[];
  try{
   while(s.winner===null&&plies<140){
    const side=s.turn;
    const r=await engines[side].search({...s,historyStates:history.slice(-48)});
    const a=r.pv?.[0];if(!a||!legal(s,a))throw Error('invalid AI move seed='+seedIndex+' branch='+branch+' ply='+plies+' action='+JSON.stringify(a));
    if(plies<16)trace.push({side,action:a});
    history.push(clone(s));s=apply(s,a);plies++;
   }
   const item={seedIndex,branch,winner:s.winner,plies,cutoff:s.winner===null,finalDistance:[distance(s,0),distance(s,1)],finalWalls:s.left,trace};
   out.runs.push(item);console.log(seedIndex+1,branch,'winner',item.winner,'plies',plies,'cutoff',item.cutoff);
   writeFileSync('evaluation/a4-vs-a8-branch-rollout.json',JSON.stringify(out,null,2));
  }finally{await Promise.all(engines.map(e=>e.close()));}
 }
}
