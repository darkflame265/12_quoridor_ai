import {initial,legal,apply,moves,distance} from '../src/engine.js';
import {rotate} from './suite.js';
import {positionKey} from '../src/spectator.js';

const h=(x,y)=>({type:'wall',o:'h',x,y});
const v=(x,y)=>({type:'wall',o:'v',x,y});
const top=[h(0,2),h(2,2),h(4,2),h(6,2)];
// Coordinates transcribed from the author's figures; stocks, owners and turn
// are assumptions. A comparison action is NOT a solved best-move label.
export const bookDiagrams=[
 {id:'inside-edge',source:137,section:3,figure:9,title:'가장자리보다 안쪽부터 막기',
  p:[{x:4,y:5},{x:8,y:3}],walls:top,compare:[h(5,5),h(7,5)],
  note:'9번째가 아닌 0기준 이미지 9의 시작 배치. 이미지 10·12의 두 설치를 비교.'},
 {id:'chamber-horizontal',source:138,section:5,figure:1,title:'3×3 구역의 가로 공격',
  p:[{x:4,y:7},{x:6,y:4}],walls:[...top,v(5,3),h(5,5),h(7,5)],compare:[h(6,4)],
  note:'이미지 1 왼쪽. 흑이 g5에 온 뒤 백 차례라고 가정. 흑 i5 이동 후 가로벽의 후속 대응을 검사할 수 있음.'},
 {id:'chamber-vertical',source:138,section:5,figure:1,title:'3×3 구역의 세로 공격',
  p:[{x:4,y:7},{x:7,y:5}],walls:[...top,v(5,3),h(5,5),h(7,5)],compare:[v(6,4)],
  note:'이미지 1 오른쪽. 흑이 h4에 온 뒤 백 차례라고 가정. 흑 h6 이동 후 세로벽의 후속 대응을 검사할 수 있음.'},
 {id:'long-net',source:141,section:11,figure:11,title:'가까운 봉쇄와 먼 장문',
  p:[{x:3,y:5},{x:6,y:3}],walls:[h(3,2),h(5,2),h(7,2),h(0,5),h(2,5),h(4,5),v(5,4)],compare:[h(6,5),h(7,7)],
  note:'이미지 11의 갈색 벽만 사용. 이미지 12의 가까운 벽·먼 벽을 비교. 후속 설치의 강제 성공을 가정하지 않음.'},
 {id:'backdoor',source:141,section:9,figure:7,title:'가장자리 봉쇄의 뒷문 반례',
  p:[{x:4,y:5},{x:5,y:1}],walls:[h(2,2),h(4,2),v(5,1),h(5,3),v(4,4),h(1,4),h(3,4),h(3,5)],compare:[h(0,5)],
  note:'이미지 7에서 파란 공격 벽·빨간 대응 벽을 제외한 배치. 이 그림은 원칙의 반례이며 파란 벽을 정답으로 지정하지 않음.'},
];
export const actionKey=a=>a.type==='move'?`m:${a.x}:${a.y}`:`${a.o}:${a.x}:${a.y}`;
export const rotateAction=a=>({...a,x:(a.type==='move'?8:7)-a.x,y:(a.type==='move'?8:7)-a.y});
export function bookCases(){
 const rows=[];
 for(const d of bookDiagrams){
  const n=d.walls.length;
  for(const [stock,placed0] of [['balanced',Math.floor(n/2)],['attacker-poor',n],['defender-poor',0]]){
   const state={p:structuredClone(d.p),walls:d.walls.map((w,i)=>({...w,owner:i<placed0?0:1})),left:[10-placed0,10-(n-placed0)],turn:0,winner:null};
   for(const flipped of [false,true])rows.push({id:`${d.id}/${stock}/${flipped?'rotated':'normal'}`,diagram:d.id,source:`https://greena0216.tistory.com/${d.source}`,section:d.section,figure:d.figure,title:d.title,note:d.note,
    assumptions:{turn:'attacker',stock,wallOwners:'synthetic stock-conserving assignment',flipped,notSolved:true},state:flipped?rotate(state):state,compare:flipped?d.compare.map(rotateAction):structuredClone(d.compare)});
  }
 }
 return rows;
}
export function wallEffect(s,a){
 if(a.type!=='wall'||!legal(s,a))return null;
 const t=s.turn,n=apply(s,a),own=distance(n,t)-distance(s,t),opponent=distance(n,1-t)-distance(s,1-t);
 return {ownDelay:own,opponentDelay:opponent,net:opponent-own-1};
}
// Produce an importable legal replay rather than teleporting into a diagram.
// Walls are installed first; a joint-pawn BFS then reaches the exact target.
export function makeBookReplay(target){
 let s=initial();const records=[],pending=[0,1].map(t=>target.walls.filter(w=>w.owner===t));
 const commit=a=>{if(!legal(s,a))throw Error('Illegal book prefix');records.push(a);s=apply(s,a);};
 while(pending.some(a=>a.length)){
  const wall=pending[s.turn].shift();
  if(wall)commit({type:'wall',o:wall.o,x:wall.x,y:wall.y});
  else {const a=moves(s).find(a=>a.y===s.p[s.turn].y);if(!a)throw Error('No safe waiting move');commit(a);}
 }
 const pawnKey=q=>`${q.p[0].y*9+q.p[0].x}:${q.p[1].y*9+q.p[1].x}:${q.turn}`;
 const queue=[{state:s,parent:-1,action:null}],seen=new Set([pawnKey(s)]),goal=pawnKey(target);let found=-1;
 for(let i=0;i<queue.length;i++){
  const q=queue[i];if(pawnKey(q.state)===goal){found=i;break;}
  for(const a of moves(q.state)){
   const n=apply(q.state,a);if(n.winner!==null)continue;
   const k=pawnKey(n);if(seen.has(k))continue;seen.add(k);queue.push({state:n,parent:i,action:a});
  }
 }
 if(found<0)throw Error('Diagram not reachable by legal prefix');
 const tail=[];for(let i=found;queue[i].parent>=0;i=queue[i].parent)tail.push(queue[i].action);
 for(const a of tail.reverse())commit(a);
 if(positionKey(s)!==positionKey(target))throw Error('Replay target mismatch');
 return {version:2,records,mode:'sandbox',side:target.turn,startPosition:'top',time:'500',cores:'4',engine:'atlas5'};
}
