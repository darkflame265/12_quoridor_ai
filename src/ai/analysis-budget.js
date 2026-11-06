const reasonLabels={
 progress:'최근 경로에서 왕복·후퇴 감지 · 전진 대안 재검토',
 horizon:'연결 벽 상황 · 깊은 후보 비교 필요',
 defense:'상대 공격과 방어 응수 비교',exact:'완전 탐색 결과',stable:'여러 깊이에서 추천·평가 안정',
 race:'말 이동 경주에서 열세 · 벽 대안 비교',incomplete:'위험 평가 자료 부족',connection:'연결 벽 공격 위험',
 reserve:'남은 방어벽 부족','wall-streak':'연속 벽 소비',goal:'골인 근접',changing:'추천 또는 평가 변화 중',
 'minimum-time':'최소 관찰 시간 확보','engine-complete':'이번 계산 종료','time-limit':'2초 계산 완료'
};
// Display all review conditions, independently of the first budget reason.
// This does not change search scores, stopping policy or compute limits.
export function analysisConcerns(state,r,wallStreak=0){
 if(!r||r.exact===true)return [];
 const reasons=new Set(),defense=r.threatDefense,chain=r.connectionRisk;
 if(r.progressReview?.active)reasons.add('progress');
 if(r.raceAssessment?.pawnOnlyOutcome===-1)reasons.add('race');
 if(defense?.active){
  if(!defense.complete||!defense.selected)reasons.add('incomplete');
  if(Math.max(defense.initialRisk??0,defense.selected?.risk??0)>=2)reasons.add('defense');
 }else{
  if(!chain||!chain.complete||chain.active&&!chain.selected)reasons.add('incomplete');
  if(Math.max(chain?.estimate??0,chain?.selected?.risk??0)>=2)reasons.add('connection');
 }
 if(r.reserveDefense?.complete===false||r.weakWallConsumption?.complete===false)reasons.add('incomplete');
 if(state?.left?.[state.turn]<=3&&state.left[1-state.turn]>0)reasons.add('reserve');
 if(Math.max(wallStreak,r.weakWallConsumption?.wallStreak??0)>=2)reasons.add('wall-streak');
 if(r.goalSafety?.goalThreat||chain?.distances?.some(d=>d<=3))reasons.add('goal');
 if(state?.walls?.length>=3&&state.left[0]>0&&state.left[1]>0&&(r.depth??0)<6)reasons.add('horizon');
 const reason=r.analysisBudget?.reason;
 if(['progress','race','incomplete','defense','connection','reserve','wall-streak','goal','horizon'].includes(reason))reasons.add(reason);
 return [...reasons];
}
const same=(a,b)=>!!a&&!!b&&a.type===b.type&&a.x===b.x&&a.y===b.y&&(a.type!=='wall'||a.o===b.o);
export function recommendationStable(history,latest){
 if(!latest)return false;
 const recent=history.slice(-3),reference=recent.find(r=>r.depth<latest.depth&&r.depth%2===latest.depth%2);
 return recent.length===3&&recent.every(r=>same(r.pv[0],recent[0].pv[0]))&&recent.every(r=>Number.isFinite(r.score)&&Math.abs(r.score)<29000)&&!!reference&&Math.abs(latest.score-reference.score)<=48&&Math.max(...recent.map(r=>r.score))-Math.min(...recent.map(r=>r.score))<=180;
}
// A compute-saving heuristic, never a position-safety certificate.
export function analysisBudget(state,latest,history,elapsedMs,wallStreak=0){
 if(latest?.exact===true)return {stop:true,reason:'exact',phase:'complete'};
 if(latest?.progressReview?.active)return {stop:false,reason:'progress',phase:'deep'};
 if(latest?.raceAssessment?.pawnOnlyOutcome===-1)return {stop:false,reason:'race',phase:'deep'};
 const defense=latest?.threatDefense;
 if(defense?.active){
  if(!defense.complete||!defense.selected)return {stop:false,reason:'incomplete',phase:'deep'};
  if(Math.max(defense.initialRisk,defense.selected.risk)>=2)return {stop:false,reason:'defense',phase:'deep'};
 }
 const chain=latest?.connectionRisk;
 const risk=Math.max(chain?.estimate??0,chain?.selected?.risk??0);
 if(!defense?.active&&(!chain||!chain.complete)||latest.reserveDefense?.complete===false||latest.weakWallConsumption?.complete===false)return {stop:false,reason:'incomplete',phase:'deep'};
 if(!defense?.active&&risk>=2)return {stop:false,reason:'connection',phase:'deep'};
 if(!defense?.active&&chain.active&&!chain.selected)return {stop:false,reason:'incomplete',phase:'deep'};
 if(state.left[state.turn]<=3&&state.left[1-state.turn]>0)return {stop:false,reason:'reserve',phase:'deep'};
 if(wallStreak>=2)return {stop:false,reason:'wall-streak',phase:'deep'};
 if(chain?.distances?.some(d=>d<=3))return {stop:false,reason:'goal',phase:'deep'};
 // Three placed walls can already form a long detour. Repeated agreement at
 // shallow depth did not survive the next completed iteration in game 7.
 // Keep the candidate private and require deeper comparison before auto-stop.
 if(state.walls.length>=3&&state.left[0]>0&&state.left[1]>0&&(latest.depth??0)<6)return {stop:false,reason:'horizon',phase:'deep'};
 // Compare scores at equal depth parity; an odd/even horizon swing alone
 // should not alone prevent early completion. Bound the whole score range.
 const stable=recommendationStable(history,latest);
 if(elapsedMs>=500&&stable&&(latest.depth??0)>=4)return {stop:true,reason:'stable',phase:'complete'};
 return {stop:false,reason:stable?'minimum-time':'changing',phase:elapsedMs<500?'quick':'deep'};
}
export const budgetReason=reason=>reasonLabels[reason]??'';
