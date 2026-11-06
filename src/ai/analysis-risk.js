export function analysisRisk(result,turn){
 if(result.exact===true)return result.outcome===-1?'후반 완전 해법: 현재 위치는 패배입니다.':result.outcome===0?'후반 완전 해법: 현재 위치는 무승부입니다.':'';
 if(Number.isFinite(result.score)&&result.score<=-29500)return '탐색에서 패배 수순을 감지했습니다. 제한 시간 내 탐색 판단입니다.';
 if(result.goalSafety?.goalThreat)return `골인 경로 위험 · 상대 벽 ${result.goalSafety.wallStock?.[1-turn]??'?'}개 · 연속 방어벽으로 우회할 위험이 있습니다.`;
 if(Number.isFinite(result.score)&&result.score<-240)return '현재 탐색에서 불리하게 평가합니다. 평가 점수는 승률이 아닙니다.';
 return '';
}
