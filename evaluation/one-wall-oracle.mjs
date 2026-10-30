import {Position,decode,solveEndgame} from '../src/search.js';
// Exact outcomes when target has no walls and the opponent may install AT MOST
// ONE wall, at any future turn. A target loss is also a loss witness against
// an opponent holding more walls. A target win is not a full-game win proof.
export function solveOneEnemyWall(state,target){
 if(![0,1].includes(target)||state.left[target]!==0)throw Error('Target must have no remaining walls');
 const opponent=1-target,p=new Position({...state,left:[0,0]}),size=81*81*2;
 const key=(a,b,t)=>(a*81+b)*2+t,outcome=new Int8Array(size),degree=new Uint16Array(size);
 const predecessors=Array.from({length:size},()=>[]),queue=[];
 const goals=(edges,t)=>{
  const seen=new Uint8Array(81),q=[];
  for(let x=0;x<9;x++){const n=t===0?x:72+x;seen[n]=1;q.push(n);}
  for(let i=0;i<q.length;i++)for(let d=0;d<4;d++){const n=edges[q[i]*4+d];if(n>=0&&!seen[n]){seen[n]=1;q.push(n);}}
  return seen;
 };
 const walls=[];
 for(let code=81;state.left[opponent]>0&&code<209;code++)if(p.wallFits(code)){
  const next={...state,walls:[...state.walls,{...decode(code),owner:opponent}],left:[0,0]};
  const geometry=new Position(next);
  walls.push({code,table:solveEndgame(next),reach:[goals(geometry.edges,0),goals(geometry.edges,1)]});
 }
 for(let a=0;a<81;a++)for(let b=0;b<81;b++)if(a!==b)for(let t=0;t<2;t++){
  const k=key(a,b,t),winner=a<9?0:b>=72?1:-1;
  if(winner>=0){outcome[k]=winner===t?1:-1;queue.push(k);continue;}
  p.p=[a,b];p.turn=t;
  for(const move of p.pawnMoves()){
   const child=t===0?key(move,b,1):key(a,move,0);predecessors[child].push(k);degree[k]++;
  }
  if(t===opponent)for(const wall of walls){
   if(!wall.reach[0][a]||!wall.reach[1][b])continue;
   const r=wall.table.lookup(a,b,target).outcome;
   if(r===-1){outcome[k]=1;break;}
   if(r===0)degree[k]++; // A wall leading to a draw prevents a forced loss.
   // A wall giving target a win is already a resolved losing edge; its
   // contribution to the unresolved degree is zero.
  }
  if(outcome[k]===1)queue.push(k);
  else if(!degree[k]){outcome[k]=-1;queue.push(k);}
 }
 for(let i=0;i<queue.length;i++){
  const child=queue[i];
  for(const parent of predecessors[child]){
   if(outcome[parent])continue;
   if(outcome[child]===-1){outcome[parent]=1;queue.push(parent);}
   else if(--degree[parent]===0){outcome[parent]=-1;queue.push(parent);}
  }
 }
 return {wallGeometries:walls.length,lookup(a,b,t){return outcome[key(a,b,t)];}};
}
