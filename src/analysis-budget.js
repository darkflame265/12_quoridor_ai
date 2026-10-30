const same=(a,b)=>!!a&&!!b&&a.type===b.type&&a.x===b.x&&a.y===b.y&&(a.type!=='wall'||a.o===b.o);
export function recommendationStable(history,latest){
 if(!latest)return false;
 const recent=history.slice(-3),reference=recent.find(r=>r.depth<latest.depth&&r.depth%2===latest.depth%2);
 return recent.length===3&&recent.every(r=>same(r.pv[0],recent[0].pv[0]))&&recent.every(r=>Number.isFinite(r.score)&&Math.abs(r.score)<29000)&&!!reference&&Math.abs(latest.score-reference.score)<=48&&Math.max(...recent.map(r=>r.score))-Math.min(...recent.map(r=>r.score))<=180;
}
// A compute-saving heuristic, never a position-safety certificate.
export function analysisBudget(state,latest,history,elapsedMs,wallStreak=0){
 if(latest?.exact===true)return {stop:true,reason:'exact',phase:'complete'};
 if(latest?.raceAssessment?.pawnOnlyOutcome===-1)return {stop:false,reason:'race',phase:'deep'};
 const chain=latest?.connectionRisk;
 const risk=Math.max(chain?.estimate??0,chain?.selected?.risk??0);
 if(!chain||!chain.complete||latest.reserveDefense?.complete===false||latest.weakWallConsumption?.complete===false)return {stop:false,reason:'incomplete',phase:'deep'};
 if(risk>=2)return {stop:false,reason:'connection',phase:'deep'};
 if(chain.active&&!chain.selected)return {stop:false,reason:'incomplete',phase:'deep'};
 if(state.left[state.turn]<=3&&state.left[1-state.turn]>0)return {stop:false,reason:'reserve',phase:'deep'};
 if(wallStreak>=2)return {stop:false,reason:'wall-streak',phase:'deep'};
 if(chain.distances?.some(d=>d<=3))return {stop:false,reason:'goal',phase:'deep'};
 // Compare scores at equal depth parity; an odd/even horizon swing alone
 // should not force fifteen seconds. Keep a bound on the whole score range.
 const stable=recommendationStable(history,latest);
 if(elapsedMs>=2000&&stable&&(latest.depth??0)>=4)return {stop:true,reason:'stable',phase:'complete'};
 return {stop:false,reason:stable?'minimum-time':'changing',phase:elapsedMs<500?'quick':'deep'};
}
export const budgetReason=reason=>({exact:'완전 탐색 결과',stable:'여러 깊이에서 추천·평가 안정',race:'말 이동 경주에서 열세 · 벽 대안 비교',incomplete:'위험 평가 자료 부족',connection:'연결 벽 공격 위험',reserve:'남은 방어벽 부족','wall-streak':'연속 벽 소비',goal:'골인 근접',changing:'추천 또는 평가 변화 중','minimum-time':'최소 관찰 시간 확보','engine-complete':'엔진 계산 완료'})[reason]??'';
