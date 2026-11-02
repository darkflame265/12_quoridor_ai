import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {apply,legal,distance} from '../src/engine.js';
const source=JSON.parse(readFileSync('reports/sigma-selfplay/sigma2-valueguard20.json','utf8'));
const game=source.completed[4],ply=35,original=game.trace[ply-1];
const replacement={type:'wall',x:2,y:4,o:'h'};
const sig1=new SigmaProcess({variant:'sigma1'}),sig2=new SigmaProcess({variant:'sigma2'});
const choices=[['original',original.action],['alternative',replacement]];
const output=[];
try {
 await Promise.all([sig1.health(),sig2.health()]);
 for(const [label,first] of choices){
  if(!legal(original.state,first))throw Error('illegal alternative');
  let s=apply(original.state,first);
  const past=[...game.trace.slice(0,ply-1).map(t=>t.state),original.state];
  const continuation=[];
  for(let i=0;i<10&&s.winner===null;i++){
   const client=s.turn===original.side?sig2:sig1;
   const r=await client.search({...s,ply:ply+i,historyStates:past.slice(-48)});
   const a=r.pv?.[0];if(!a||!legal(s,a))throw Error('worker illegal at '+label+' '+i);
   continuation.push({ply:ply+i+1,side:s.turn,action:a,sims:r.simulations});
   past.push(s);s=apply(s,a);
  }
  output.push({label,first,continuation,final:{winner:s.winner,distances:[distance(s,0),distance(s,1)],walls:s.left,positions:s.p}});
  console.log(label,JSON.stringify(output.at(-1).final));
 }
}finally{await sig1.close();await sig2.close();}
writeFileSync('evaluation/sigma2-branch-rollout-game4.json',JSON.stringify({game:4,ply,method:'two concrete first actions, then 10 plies with current Sigma1/Sigma2 engines; neither branch proves optimality',branches:output},null,2)+'\n');
