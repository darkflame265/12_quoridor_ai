import {recommendationStable,budgetReason,analysisConcerns} from './analysis-budget.js';
export function analysisReadiness(v,{suppressed=false}={}){
 const r=v.latest??v.displayed;
 if(suppressed)return {level:'wait',label:'화면 재확인 중',reason:'배치가 확인될 때까지 추천을 숨깁니다.'};
 if(!v.displayed)return {level:'wait',label:'후보 비교 중 · 최대 2초',reason:'계산이 완료되면 추천을 한 번 확정해 표시합니다.'};
 const shown=v.displayed.pv[0],newest=r?.pv?.[0];
 if(v.pinned&&newest&&(shown.type!==newest.type||shown.x!==newest.x||shown.y!==newest.y||shown.type==='wall'&&shown.o!==newest.o))return {level:'wait',label:'고정 추천과 최신 결과가 다릅니다',reason:'현재 고정한 수와 새 추천을 비교하세요.'};
 const concerns=analysisConcerns(v.state,r,v.wallStreak),review=concerns.map(budgetReason).join(' · ');
 if(!v.active){
  if(r?.exact===true)return {level:'done',label:'정확 종반 계산 완료',reason:({1:'현재 배치의 승리',0:'현재 배치의 무승부','-1':'현재 배치의 패배'})[r.outcome]??'정확 계산 결과를 확인하세요.'};
  if(concerns.length)return {level:'done',label:'계산 종료 · 검토 사항 남음',reason:`${review}. 계산 종료가 위험 해소를 뜻하지는 않습니다.`};
  return {level:'done',label:'추천 확정 · 결과는 추정',reason:r?.adaptiveStop?.reason==='time-limit'?'2초 계산을 마쳤습니다. 해당 배치에서는 이 추천을 유지합니다.':r?.adaptiveStop?.reason==='stable'?'여러 완료 깊이에서 추천이 안정돼 확정했습니다.':'엔진 계산을 마치고 추천을 확정했습니다.'};
 }
 if(v.changedAt&&performance.now()-v.changedAt<2000)return {level:'wait',label:'대기 권장 · 추천 변경',reason:`새 추천을 확인하세요.${review?' '+review:''}`};
 if(concerns.length)return {level:'wait',label:'대기 권장 · 추가 검토 중',reason:review};
 if(v.elapsedMs>=2000&&recommendationStable(v.history??[],r))return {level:'ready',label:'추천 잠정 안정 · 계산 중',reason:'최근 세 깊이에서 추천이 같았습니다. 착수 안전이나 추가 계산의 실익을 보장하지 않습니다.'};
 if(v.lastUpdateAt&&performance.now()-v.lastUpdateAt>=3000)return {level:'wait',label:'다음 완료 결과 대기 중',reason:'새 완료 결과가 아직 없습니다. 더 좋은 수가 나올 가능성은 판단할 수 없습니다.'};
 return {level:'wait',label:'후보 비교 중',reason:budgetReason(v.reason)||'완료된 다음 비교 결과를 기다립니다.'};
}
export function analysisTiming(v,now=performance.now()){
 const elapsed=Math.max(0,v.elapsedMs??0)/1000,parts=[`분석 경과 ${elapsed.toFixed(1)}초`];
 parts.push(v.active?`계산 예산 잔여 ${Math.max(0,(v.limitMs??2000)/1000-elapsed).toFixed(1)}초`:'계산 종료');
 if(v.lastUpdateAt!=null)parts.push(`마지막 완료 결과 ${Math.max(0,(now-v.lastUpdateAt)/1000).toFixed(1)}초 전`);
 if(v.latest?.depth!=null)parts.push(`완료 깊이 ${v.latest.depth}${v.latest.ponderReused?' · 사전 계산 재사용':''}`);
 if(v.active)parts.push('다음 결과 완료 시점은 미정');
 return parts.join(' · ');
}
function verdict(r){
 if(!r)return '판세 분석 준비 중';
 if(r.exact===true)return `판세: 정확 종반 판정 · ${({1:'승리',0:'무승부','-1':'패배'})[r.outcome]??'결과 확인 필요'}`;
 if(r.winProof?.shortestWinProven===false)return '판세: 승리 전략 확인 · 최단 수순 보장은 아님';
 if(r.raceAssessment?.pawnOnlyOutcome===-1)return '판세: 말 이동 경주에서 열세 · 벽 전략까지 포함한 패배 확정은 아닙니다.';
 if(r.score<=-29000)return '판세: 현재 탐색은 패배 수순 예상';
 if(r.score>=29000)return '판세: 현재 탐색은 승리 수순 예상';
 if(r.progressReview?.active)return '판세: 왕복·후퇴 의심 · 전진 대안 비교 필요';
 if(r.threatDefense?.selected?.risk>=2)return `판세: 상대 연속 공격에 경로가 취약할 수 있습니다 · 위험 추정 ${r.threatDefense.selected.risk}`;
 if(!Number.isFinite(r.score))return '판세: 승패는 확정되지 않았습니다.';
 return r.score<-120?'판세: 현재 평가상 불리':r.score>120?'판세: 현재 평가상 유리 · 승률 보장은 아닙니다.':'판세: 평가 차이가 작습니다.';
}
export function positionVerdict(r,pinnedDifferent=false){return (pinnedDifferent?'최신 계산 기준 · ':'')+verdict(r);}
