import {apply,legal,moves,neighbors} from './engine.js';
const wallKey=w=>`${w.owner}:${w.o}:${w.x}:${w.y}`;
export const boardKey=s=>JSON.stringify({p:s.p,walls:s.walls.map(wallKey).sort(),left:s.left});
// Each player can act at most once in two plies. Only target pawn positions
// and new target walls can therefore be actions; no broad game-tree search.
export function inferScreenMoves(before,target){
 if(boardKey(before)===boardKey(target))return [];
 const old=new Set(before.walls.map(wallKey)),next=new Set(target.walls.map(wallKey));
 if([...old].some(k=>!next.has(k)))throw Error('벽이 사라지거나 색이 바뀌었습니다. 되돌리기·새 게임은 배치를 다시 적용하세요.');
 const added=target.walls.filter(w=>!old.has(wallKey(w))),answers=[];
 function visit(s,path){
  if(path.length&&boardKey(s)===boardKey(target)){answers.push(path);return;}
  if(path.length===2||s.winner!==null)return;
  const p=target.p[s.turn],actions=[{type:'move',x:p.x,y:p.y},...added.filter(w=>w.owner===s.turn&&!s.walls.some(a=>wallKey(a)===wallKey(w))).map(({x,y,o})=>({type:'wall',x,y,o}))];
  for(const a of actions)if(legal(s,a))visit(apply(s,a),[...path,a]);
 }
 visit(before,[]);
 if(answers.length!==1)throw Error('현재 차례에서 가능한 한두 수로 연결되지 않습니다. 원본 차례·보드 영역을 확인하고 다시 적용하세요.');
 return answers[0];
}
export class StableScreenBoard{
 constructor(required=3){this.required=required;this.reset();}
 reset(){this.key=null;this.count=0;}
 observe(board){const key=boardKey(board);if(key===this.key)this.count++;else{this.key=key;this.count=1;}return this.count>=this.required;}
}
// Recover only a unique shortest legal history, with hard work limits. A
// matching final board never licenses inventing one of several histories.
export function recoverScreenMoves(before,target,{maxPlies=6,maxNodes=12000,maxMs=80}={}){
 try{return inferScreenMoves(before,target);}catch{}
 const old=new Set(before.walls.map(wallKey)),wanted=new Set(target.walls.map(wallKey));
 if([...old].some(k=>!wanted.has(k)))throw Error('벽 삭제·되돌리기 감지 · 현재 화면 재동기화를 이용하세요.');
 const added=target.walls.filter(w=>!old.has(wallKey(w))),deadline=performance.now()+maxMs;let nodes=0;
 function minimum(s,t){const q=[{...s.p[t],d:0}],seen=new Set();for(const p of q){if(p.x===target.p[t].x&&p.y===target.p[t].y)return Math.ceil(p.d/2);for(const n of neighbors(s,p)){const k=n.y*9+n.x;if(!seen.has(k)){seen.add(k);q.push({...n,d:p.d+1});}}}return 99;}
 for(let depth=3;depth<=maxPlies;depth++){
  const answers=[];const memo=new Map();
  function visit(s,path){
   if(++nodes>maxNodes||performance.now()>deadline)throw Error('진행 복원 계산 한도 초과 · 현재 화면 재동기화를 이용하세요.');
   const left=depth-path.length;if(!left){if(boardKey(s)===boardKey(target))answers.push(path);return;}
   if(s.winner!==null||answers.length>1)return;
   const remaining=added.filter(w=>!s.walls.some(a=>wallKey(a)===wallKey(w)));
   for(const t of [0,1]){const turns=Math.floor((left+(s.turn===t?1:0))/2);if(minimum(s,t)+remaining.filter(w=>w.owner===t).length>turns)return;}
   const key=boardKey(s)+':'+s.turn+':'+left,count=memo.get(key)??0;if(count>=2)return;memo.set(key,count+1);
   const actions=[...moves(s),...remaining.filter(w=>w.owner===s.turn).map(({x,y,o})=>({type:'wall',x,y,o}))];
   for(const a of actions)if(legal(s,a)){visit(apply(s,a),[...path,a]);if(answers.length>1)return;}
  }
  visit(before,[]);
  if(answers.length===1)return answers[0];
  if(answers.length>1)throw Error('놓친 수의 진행 순서가 여러 개입니다 · 중간 기보를 만들지 않고 재동기화 확인을 기다립니다.');
 }
 throw Error('6수 이내 진행을 복원하지 못했습니다 · 현재 화면 재동기화를 이용하세요.');
}
export function recoverScreenSequence(before,target,frames=[]){
 let state=before;const actions=[];
 try{
  for(const frame of frames){if(boardKey(state)===boardKey(frame))continue;const step=inferScreenMoves(state,frame);for(const a of step)state=apply(state,a);actions.push(...step);if(boardKey(state)===boardKey(target))return actions;}
 }catch{}
 return recoverScreenMoves(before,target);
}
