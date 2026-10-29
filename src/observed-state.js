import {initial,clone,validWall,apply,legal} from './engine.js';
export function snapshotIssues(s){
 const errors=[];
 if(!s||!Array.isArray(s.p)||s.p.length!==2||s.p.some(p=>!p||!Number.isInteger(p.x)||!Number.isInteger(p.y)||p.x<0||p.x>8||p.y<0||p.y>8))errors.push('두 말의 위치를 모두 지정하세요.');
 if(!Array.isArray(s?.walls)||s.walls.length>20)errors.push('벽은 최대 20개까지 지정할 수 있습니다.');
 if(!Array.isArray(s?.left)||s.left.length!==2||s.left.some(n=>!Number.isInteger(n)||n<0||n>10))errors.push('잔여 벽은 각각 0~10개여야 합니다.');
 if(![0,1].includes(s?.turn))errors.push('현재 차례를 선택하세요.');
 if(errors.length)return errors;
 if(s.p[0].x===s.p[1].x&&s.p[0].y===s.p[1].y)errors.push('두 말이 같은 칸에 있습니다.');
 const won=s.p.map((p,t)=>p.y===(t===0?0:8));
 if(won[0]&&won[1])errors.push('양쪽 말이 동시에 목표 줄에 있습니다. 시작 방향을 확인하세요.');
 const winner=won[0]?0:won[1]?1:null;
 if(s.winner!==winner)errors.push('승리 상태가 말 위치와 다릅니다.');
 if(winner!==null&&s.turn===winner)errors.push('종료 상태의 차례가 올바르지 않습니다.');
 let probe={...initial(),p:clone(s.p)};
 for(const w of s.walls){
  if(!w||!['h','v'].includes(w.o)||!Number.isInteger(w.x)||!Number.isInteger(w.y)||w.x<0||w.x>7||w.y<0||w.y>7||![0,1].includes(w.owner)){errors.push('벽의 위치·방향·색상을 확인하세요.');continue;}
  probe.turn=w.owner;const action={type:'wall',o:w.o,x:w.x,y:w.y};
  if(!validWall(probe,action))errors.push('겹침·교차·경로 차단 또는 벽 수 초과가 있습니다.');else probe=apply(probe,action);
 }
 for(const t of [0,1])if(s.left[t]+s.walls.filter(w=>w?.owner===t).length!==10)errors.push(`${t===0?'청록':'분홍'} 잔여 벽과 설치된 벽 수가 맞지 않습니다.`);
 return [...new Set(errors)];
}
export function checkedSnapshot(s){
 const errors=snapshotIssues(s);if(errors.length)throw Error(errors.join(' '));
 return {p:s.p.map(p=>({x:p.x,y:p.y})),walls:s.walls.map(w=>({type:'wall',x:w.x,y:w.y,o:w.o,owner:w.owner})),left:[...s.left],turn:s.turn,winner:s.winner};
}
export function snapshotFromDraft(draft,{bottom=0,turn=0,left}={}){
 const flip=Number(bottom)===1;
 const p=draft.p.map(p=>p?{x:flip?8-p.x:p.x,y:flip?8-p.y:p.y}:null);
 const walls=draft.walls.map(w=>({...w,type:'wall',x:flip?7-w.x:w.x,y:flip?7-w.y:w.y}));
 const winner=p[0]?.y===0?0:p[1]?.y===8?1:null;
 return {p,walls,left:left??[0,1].map(t=>10-walls.filter(w=>w.owner===t).length),turn:winner===null?Number(turn):1-winner,winner};
}
export function restoreObservedSession(data){
 if(!data||!Array.isArray(data.records)||data.records.length>10000)throw Error('기보 형식 오류');
 const base=data.baseState===undefined?null:checkedSnapshot(data.baseState);
 let state=base?clone(base):initial();const past=[];
 for(const a of data.records){if(!a||!legal(state,a))throw Error('불가능한 수가 포함된 기보입니다.');past.push(clone(state));state=apply(state,a);}
 return {state,past,records:clone(data.records),baseState:base};
}
