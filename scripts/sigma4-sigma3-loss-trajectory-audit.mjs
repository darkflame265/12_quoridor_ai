import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,distance,moves,legal,clone} from '../src/engine.js';
const d=JSON.parse(readFileSync('evaluation/sigma4-bitset200-vs-sigma23-20261105.json'));
const list=[];
for(const g of d.games.filter(g=>g.opponent==='sigma3'&&!g.candidateWon)){
 let s=initial(),history=[],out=[];
 for(const a of d.settings.fixtures.find(x=>x.id===g.fixture).actions){history.push(clone(s));s=apply(s,a)}
 for(let ply=6;ply<g.actions.length;ply++){
  const a=g.actions[ply],before={own:distance(s,g.candidateSide),enemy:distance(s,1-g.candidateSide),wallsOwn:s.left[g.candidateSide],wallsEnemy:s.left[1-g.candidateSide]};
  if(s.turn===g.candidateSide && (ply>=g.actions.length-22 || (ply>=10&&ply%8===0))){
   const n=apply(s,a);
   const vulnerable=moves(n).filter(b=>apply(n,b).winner===n.turn);
   out.push({ply,action:a,before,after:{own:distance(n,g.candidateSide),enemy:distance(n,1-g.candidateSide)},enemyImmediateGoal:vulnerable.length,turn:s.turn});
  }
  history.push(clone(s));s=apply(s,a);
 }
 list.push({fixture:g.fixture,seat:g.candidateSide,totalPlies:g.plies,positions:out});
}
writeFileSync('evaluation/sigma4-sigma3-loss-trajectory-audit-20261105.json',JSON.stringify(list,null,2)+'\n');
console.log(JSON.stringify(list,null,2));
