// UI coordinates have y=0 at the top; Sigma's NN always moves toward row 8.
import {moves,apply} from '../game/engine.js';
const cache=new WeakMap();
export function geometry(s){
 if(cache.has(s))return cache.get(s);
 const edges=Array.from({length:81},(_,i)=>{const x=i%9,y=(i/9)|0;return [y>0?i-9:-1,x<8?i+1:-1,y<8?i+9:-1,x>0?i-1:-1];});
 for(const w of s.walls)for(const [a,b] of wallEdges(w)){edges[a][edges[a].indexOf(b)]=-1;edges[b][edges[b].indexOf(a)]=-1;}
 const grids=[flood(edges,0),flood(edges,8)];const result={edges,grids};cache.set(s,result);return result;
}
export function flood(edges,goal){
 const d=new Uint8Array(81).fill(81),q=new Uint8Array(81);let head=0,tail=0;
 for(let x=0;x<9;x++){const i=goal*9+x;d[i]=0;q[tail++]=i;}
 while(head<tail){const a=q[head++];for(const b of edges[a])if(b>=0&&d[b]===81){d[b]=d[a]+1;q[tail++]=b;}}
 return d;
}
function wallEdges(w){const i=w.y*9+w.x;return w.o==='h'?[[i,i+9],[i+1,i+10]]:[[i,i+1],[i+9,i+10]];}
export function legalActions(s){
 if(s.winner!==null)return [];
 const actions=moves(s);if(!s.left[s.turn])return actions;
 const {edges}=geometry(s),p=s.p.map(p=>p.y*9+p.x);
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  if(s.walls.some(w=>w.o!==o?w.x===x&&w.y===y:o==='h'?w.y===y&&Math.abs(w.x-x)<2:w.x===x&&Math.abs(w.y-y)<2))continue;
  const a={type:'wall',x,y,o},pairs=wallEdges(a),slots=[];
  for(const [i,j] of pairs){const u=edges[i].indexOf(j),v=edges[j].indexOf(i);if(u<0||v<0)throw Error('Invalid wall geometry');slots.push([i,u,j],[j,v,i]);edges[i][u]=-1;edges[j][v]=-1;}
  const valid=flood(edges,0)[p[0]]<81&&flood(edges,8)[p[1]]<81;
  for(const [i,slot,j] of slots)edges[i][slot]=j;
  if(valid)actions.push(a);
 }
 return actions;
}
export function encodePosition(s){
 const input=new Float32Array(648),t=s.turn,cy=y=>t?y:8-y;
 input[cy(s.p[t].y)*9+s.p[t].x]=1;input[81+cy(s.p[1-t].y)*9+s.p[1-t].x]=1;
 for(const w of s.walls){const y=t?w.y:7-w.y,x=w.x;if(w.o==='h'){input[162+y*9+x]=1;input[162+y*9+x+1]=1;}else{input[243+y*9+x]=1;input[243+(y+1)*9+x]=1;}}
 const {grids}=geometry(s);
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){const i=y*9+x,j=cy(y)*9+x;input[324+j]=s.left[t]/10;input[405+j]=s.left[1-t]/10;input[486+j]=Math.min(1,grids[t][i]/80);input[567+j]=Math.min(1,grids[1-t][i]/80);}
 return input;
}
const dirs=[[0,1],[0,-1],[-1,0],[1,0],[-1,1],[1,1],[-1,-1],[1,-1]];
export function policyIndex(s,a){
 if(a.type==='wall')return 8+(a.o==='v'?64:0)+(s.turn?a.y:7-a.y)*8+a.x;
 const p=s.p[s.turn],dx=Math.sign(a.x-p.x),dy=Math.sign(a.y-p.y)*(s.turn?1:-1);
 const i=dirs.findIndex(d=>d[0]===dx&&d[1]===dy);if(i<0)throw Error('Invalid pawn direction');return i;
}
export const positionKey=s=>JSON.stringify([s.p,s.left,s.turn,s.walls.map(w=>[w.x,w.y,w.o]).sort()]);
export {apply};
