import {apply,legal} from './engine.js';
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
