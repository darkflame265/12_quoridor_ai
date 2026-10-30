import {Position,decode,solveEndgame} from '../src/search.js';
// Verification only: player0 has at most two walls; player1 has none.
export function createLimitedWallSolver({onProgress=()=>{}}={}){
const memo=new Map(),fixed=new Map();let built=0;
const geometry=s=>JSON.stringify(s.walls.map(w=>[w.x,w.y,w.o]).sort());
function solve(s,k){
 const cacheKey=k+':'+geometry(s);if(memo.has(cacheKey))return memo.get(cacheKey);
 if(k===0){let table=fixed.get(cacheKey);if(!table){table=solveEndgame(s);fixed.set(cacheKey,table);if(fixed.size>256)fixed.delete(fixed.keys().next().value);}return {lookup:(a,b,t)=>table.lookup(a,b,t).outcome};}
 const p=new Position(s),size=81*81*2,key=(a,b,t)=>(a*81+b)*2+t,outcome=new Int8Array(size),degree=new Uint16Array(size),parents=Array.from({length:size},()=>[]),queue=[],walls=[];
 function reach(edges,t){const seen=new Uint8Array(81),q=[];for(let x=0;x<9;x++){const n=t===0?x:72+x;seen[n]=1;q.push(n);}for(let i=0;i<q.length;i++)for(let d=0;d<4;d++){const n=edges[q[i]*4+d];if(n>=0&&!seen[n]){seen[n]=1;q.push(n);}}return seen;}
 for(let code=81;code<209;code++)if(p.wallFits(code)){
  const next={...s,walls:[...s.walls,{...decode(code),owner:0}],left:[k-1,0]},q=new Position(next);
  walls.push({code,table:solve(next,k-1),reach:[reach(q.edges,0),reach(q.edges,1)]});
 }
 for(let a=0;a<81;a++)for(let b=0;b<81;b++)if(a!==b)for(let t=0;t<2;t++){
  const i=key(a,b,t),winner=a<9?0:b>=72?1:-1;if(winner>=0){outcome[i]=winner===t?1:-1;queue.push(i);continue;}
  p.p=[a,b];p.turn=t;for(const m of p.pawnMoves()){const child=t===0?key(m,b,1):key(a,m,0);parents[child].push(i);degree[i]++;}
  if(t===0)for(const wall of walls){if(!wall.reach[0][a]||!wall.reach[1][b])continue;const child=wall.table.lookup(a,b,1);if(child===-1){outcome[i]=1;break;}if(child===0)degree[i]++;}
  if(outcome[i]===1)queue.push(i);else if(!degree[i]){outcome[i]=-1;queue.push(i);}
 }
 for(let i=0;i<queue.length;i++)for(const parent of parents[queue[i]]){if(outcome[parent])continue;if(outcome[queue[i]]===-1){outcome[parent]=1;queue.push(parent);}else if(--degree[parent]===0){outcome[parent]=-1;queue.push(parent);}}
 const table={walls,lookup:(a,b,t)=>outcome[key(a,b,t)]};memo.set(cacheKey,table);built++;if(k===1&&built%10===0)onProgress({completedOneWallMazes:built});return table;
}

 return {solve(s,k=s.left[0]){if(s.left[1]!==0||![0,1,2].includes(k)||s.left[0]<k)throw Error('Requires player1 with zero walls and at most two player0 walls');return solve(s,k);}};
}
