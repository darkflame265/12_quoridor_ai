import {recommendationStable,budgetReason} from './analysis-budget.js';
export function analysisReadiness(v,{suppressed=false}={}){
 const r=v.latest;
 if(suppressed)return {level:'wait',label:'화면 재확인 중',reason:'배치가 확인될 때까지 추천을 숨깁니다.'};
 if(!v.displayed)return {level:'wait',label:'첫 추천 준비 중',reason:'0.5초 목표 · 완료된 탐색 결과를 기다립니다.'};
 const shown=v.displayed.pv[0],newest=r?.pv?.[0];
 if(v.pinned&&newest&&(shown.type!==newest.type||shown.x!==newest.x||shown.y!==newest.y||shown.type==='wall'&&shown.o!==newest.o))return {level:'wait',label:'고정 추천과 최신 결과가 다릅니다',reason:'현재 고정한 수와 백그라운드의 새 추천을 비교하세요.'};
 if(!v.active)return {level:'done',label:'분석 종료',reason:r?.adaptiveStop?.heuristic?'추천 안정 추정으로 종료했습니다.':budgetReason(v.reason)||'현재 결과로 판단하세요.'};
 if(v.changedAt&&performance.now()-v.changedAt<2000)return {level:'wait',label:'대기 권장',reason:'추천이 방금 바뀌었습니다. 새 추천을 확인하세요.'};
 const stable=recommendationStable(v.history??[],r);
 const incomplete=r?.analysisBudget?.reason==='incomplete'||r?.connectionRisk?.complete===false||r?.connectionRisk?.active&&!r.connectionRisk.selected||r?.reserveDefense?.complete===false||r?.weakWallConsumption?.complete===false;
 if(v.elapsedMs>=2000&&stable&&!incomplete)return {level:'ready',label:'지금 착수 가능',reason:'최근 세 깊이에서 추천이 안정적입니다. 판세의 유불리와는 별도입니다.'};
 if(!incomplete&&v.elapsedMs>=5000&&v.lastUpdateAt&&performance.now()-v.lastUpdateAt>=3000&&(v.history??[]).length>=3)return {level:'low',label:'추가 대기 실익 낮음 · 추정',reason:'최근 완료된 비교 결과가 없습니다. 계산은 최대 예산까지 계속합니다.'};
 return {level:'wait',label:'대기 권장',reason:`${budgetReason(v.reason)||'후보 비교 중'} · 다음 완료 깊이에서 다시 판단합니다.`};
}
