import {apply,legal,neighbors,moves,distance,blocked} from '../game/engine.js';
function mapFrom(s,starts){const map=new Int16Array(81).fill(-1),q=[];for(const p of starts){const i=p.y*9+p.x;map[i]=0;q.push(p);}for(const p of q){const d=map[p.y*9+p.x];for(const n of neighbors(s,p)){const k=n.y*9+n.x;if(map[k]<0){map[k]=d+1;q.push(n);}}}return map;}
export function pressureMetrics(s,action){
 if(!action||!legal(s,action))return null;
 const me=s.turn,enemy=1-me,next=apply(s,action),enemyDelay=distance(next,enemy)-distance(s,enemy),ownDelay=distance(next,me)-distance(s,me),placementCost=action.type==='wall'?1:0;
 const result={enemyDelay,ownDelay,placementCost,netGain:enemyDelay-ownDelay-placementCost,firstContact:null,nearCutEdges:0,retainedDelay:0,enemyChoicesBefore:moves(s,enemy).length,enemyChoicesAfter:moves(next,enemy).length,bias:0};
 if(action.type!=='wall')return result;
 const goals=Array.from({length:9},(_,x)=>({x,y:enemy===0?0:8})),before=mapFrom(s,goals),after=mapFrom(next,goals),reach=mapFrom(s,[s.p[enemy]]),base=before[s.p[enemy].y*9+s.p[enemy].x];
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){
  const p={x,y},i=y*9+x;if(reach[i]<0||before[i]<0||reach[i]+before[i]!==base)continue;
  for(const q of neighbors(s,p))if(before[q.y*9+q.x]===before[i]-1&&blocked(next,p,q)){
   result.firstContact=result.firstContact===null?reach[i]:Math.min(result.firstContact,reach[i]);if(reach[i]<3)result.nearCutEdges++;
  }
 }
 const replies=moves(next,enemy);result.retainedDelay=replies.length?Math.min(...replies.map(p=>after[p.y*9+p.x]-before[p.y*9+p.x])):0;
 if(!replies.some(p=>p.y===(enemy===0?0:8))&&result.netGain>=0&&result.nearCutEdges>0)result.bias=Math.max(0,Math.min(24,(3-Math.min(3,result.firstContact))*5+Math.min(2,result.netGain)*2+Math.min(2,Math.max(0,result.retainedDelay))*2-Math.max(0,ownDelay)*8));
 return result;
}
export function pressureExplanation(s,action){
 const p=pressureMetrics(s,action);if(!p)return '';
 const signed=n=>n>0?`+${n}`:String(n);
 if(action.type==='move')return `내 경로 ${signed(p.ownDelay)}칸 · 상대 경로 ${signed(p.enemyDelay)}칸`;
 const where=p.firstContact===null?'현재 최단 경로 직접 차단 없음':p.firstContact<3?`상대 최단 경로 ${p.firstContact+1}번째 구간 차단`:`상대 최단 경로 ${p.firstContact+1}번째 구간에서 효과`;
 return `${where} · 상대 경로 ${signed(p.enemyDelay)}칸 · 내 경로 ${signed(p.ownDelay)}칸 · 설치 1턴 · 상대 이동 후 유지되는 거리 증가 ${p.retainedDelay}칸`;
}
