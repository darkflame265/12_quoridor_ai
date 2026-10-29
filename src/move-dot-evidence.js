import {moves} from './engine.js';
import {checkedSnapshot,snapshotFromDraft} from './observed-state.js';
const key=p=>`${p.x}:${p.y}`;
export function inferMoveDotTurn(board,bottom){
 const dots=board?.dots??[],result={turn:null,conflict:false,dots,checks:[],reason:'이동 점 없음 · 차례 근거 없음'};
 if(!dots.length)return result;
 if(board.wallIssues?.length||board.p?.length!==2||board.p.some(p=>!p)){result.reason='말·벽 배치를 확정하지 못해 이동 점을 검증하지 않았습니다.';return result;}
 let state,orientation;
 for(const b of bottom===0||bottom===1?[bottom]:[0,1])try{state=checkedSnapshot(snapshotFromDraft(board,{bottom:b,turn:0}));orientation=b;break;}catch{}
 if(!state||state.winner!==null){result.reason='유효한 진행 중 배치가 없어 이동 점을 검증하지 않았습니다.';return result;}
 const valid=[];
 for(const owner of [0,1]){
  const observed=dots.filter(d=>d.owner===owner),expected=moves(state,owner).map(p=>({x:orientation===1?8-p.x:p.x,y:orientation===1?8-p.y:p.y})),seen=new Set(observed.map(key)),wanted=new Set(expected.map(key));
  const exact=seen.size>0&&seen.size===observed.length&&seen.size===wanted.size&&[...seen].every(k=>wanted.has(k));
  result.checks.push({owner,observed:observed.map(({x,y})=>({x,y})),expected,exact});if(exact)valid.push(owner);
 }
 result.conflict=valid.length>1;result.turn=valid.length===1?valid[0]:null;
 result.reason=result.conflict?'양쪽 진영의 이동 점이 동시에 합법 이동 전체와 일치합니다.':result.turn===null?'이동 점이 해당 색 말의 합법 이동 전체와 일치하지 않습니다.':`${result.turn===0?'청록':'분홍'} 이동 점 ${dots.filter(d=>d.owner===result.turn).length}개 · 합법 이동 전체 일치`;
 return result;
}
