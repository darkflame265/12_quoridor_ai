import {defenseContinuation} from './defense-continuation.js';
import {ScreenPonder} from './screen-ponder.js';
import {preferCompletedSearch} from './fixed-result.js';
import {progressSnapshot,progressReview} from './progress-review.js';
import {budgetReason} from './analysis-budget.js';
import {analysisReadiness,analysisTiming,positionVerdict} from './analysis-readiness.js';
import {wallStreak,wallRun} from './wall-streak.js';
import {normalizeSessionSettings} from './session-settings.js';
import {VariableAnalysis} from './variable-analysis.js';
import {AdaptiveEngine} from './adaptive-engine.js';
import {orientPosition,orientAction,viewFlipped} from './view.js';
import {initial,clone,moves,validWall,legal,apply,notation,distance} from './engine.js';
import {SpectatorRunner,observationOutcome} from './spectator.js';
import {mountScreenCapture} from './screen-capture.js';
import {restoreObservedSession} from './observed-state.js';
import {boardKey} from './screen-sync.js';
import {pressureExplanation} from './pressure-advice.js';
import {recommendation,recordDecision,observedAction} from './decision-log.js';
import {analysisRisk} from './analysis-risk.js';

const $=s=>document.querySelector(s),colors=['#31d4c2','#fa7393'],names=['청록','분홍'];
const defaultCores=Math.min(4,Math.max(1,(navigator.hardwareConcurrency||4)-2));
let state=initial(),past=[],records=[],serial=0,busy=false,hint=null,decisionLog=[];
let baseState=null,observedBottom=null,screenCapture=null;
let screenReady=false,screenRebased=false,screenSegments=[];
let uncertaintyTimer=null,heldAnalysis=null,activeAnalysis=null,lastAnalysisTrace=null,lastShownAdvice=null;
let pool=createPlayPool(defaultCores),watchPools=[null,null],ponderTimer=null;
const variableAnalysis=new VariableAnalysis();
const screenPonder=new ScreenPonder();
function ponderStatus(status){const note=$('#screen-ponder-status');if(note)note.textContent=({thinking:'상대 차례 · 1개 계산 작업으로 응수 사전 계산 중',idle:'사전 계산 대기 · 확인된 배치가 일치할 때만 재사용',unavailable:'사전 계산 중단 · 내 차례 분석은 정상 진행',reused:'사전 계산 결과 재사용 · 현재 차례 추가 분석 중'})[status]??'';}
// Only observed positions from this game; imported snapshots invent no history.
const searchSnapshot=s=>({...progressSnapshot(s,past),historyStates:past.slice(-48).map(h=>({p:h.p,walls:h.walls,left:h.left,turn:h.turn,winner:h.winner})),wallRun:wallRun(records,past,s.turn,baseState?.turn??0),recentPawnSquares:past.filter(p=>p.turn===s.turn).slice(-4).map(p=>p.p[s.turn].y*9+p.p[s.turn].x)});
const playMs=()=>$('#time').value==='variable'?500:Number($('#time').value);
function appendProgressReview(review){
 if(!review?.active)return;
 const note=document.createElement('p');note.className='pressure-reason';
 note.textContent=`경로 재검토 · 최근 ${review.windowTurns}차례 · 내 거리 ${review.before}→${review.after}칸 · 같은 미로의 최저 ${review.bestDistance}칸 · 상대 ${review.opponentProgress}칸 전진${review.cycleTurns?` · ${review.cycleTurns}차례 전 위치로 복귀`:''}. 필요한 방어 후퇴일 수도 있어 합법 수를 금지하지 않고 추가 비교합니다.`;
 $('#analysis').append(note);
}
function appendWallSequence(weak){
 const cost=weak?.selected;if(!weak?.complete||!cost)return;
 const note=document.createElement('p');note.className='pressure-reason';
 note.textContent=`연속 벽 ${weak.observedSequence??0}개와 후보 비교 · 상대 이동 후 남는 지연 ${cost.retainedSequenceDelay??0}칸 · 내 우회 ${cost.sequenceOwnDelay??0}칸 · 각 차례 전진 대안 합 ${cost.opportunityProgress??0}칸 · 묶음 비용 ${cost.sequencePenalty??0}점 · 재고 비용 ${cost.reservePenalty??0}점${cost.defensiveException?' · 측정된 방어 효과로 비용 면제':''}. 현재 위치를 기준으로 한 제한 비교입니다.`;
 $('#analysis').append(note);
}
const watching=()=>$('#mode').value==='watch';
const human=()=>$('#mode').value==='sandbox'||$('#mode').value==='ai'&&state.turn===Number($('#side').value);
const flipped=()=>viewFlipped(Number($('#side').value),$('#start-position').value);
const viewPosition=p=>orientPosition(p,flipped());
const viewAction=a=>orientAction(a,flipped());
const engineName=id=>id==='sigma2'?'Sigma 2':id==='sigma'?'Sigma 1':id==='atlas5'?'Atlas 5.3 \u00b7 \uC548\uC815':'Atlas 0.4 \u00b7 \uCD5C\uC2E0';
function statusFor(selector){return (status,info)=>{
 const label=info?.engineInfo;
 if(selector==='#engine-status')$(selector).hidden=!['stale','unavailable','wasm'].includes(status);
 if(status==='stale'){$(selector).textContent=`엔진 버전·빌드 불일치 · 실제 ${label?.version??'알 수 없음'} · ${label?.build??'빌드 확인 실패'} · 실행기를 다시 열어 갱신하세요`;return;}
 $(selector).textContent=status==='atlas3'?'Atlas 3 사용':status==='atlas4'?'Atlas 4 WASM 사용':status==='native'?`${label?.label??'Atlas Native'} · ${label?.version??info.engine??'Native'}${label?.variant?' · '+label.variant:''}${label?.build?' · '+label.build:''}`:status==='unavailable'?'실험 엔진 사용 불가 · 다른 엔진으로 자동 대체하지 않습니다.':'Atlas 4 WASM 사용 (Native 연결 불가)';
};}
function createPlayPool(workers){const engine=$('#play-engine').value;$('#engine-status').hidden=true;return new AdaptiveEngine({workers,engine,onStatus:statusFor('#engine-status')});}
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function watchSettings(t){return {engine:$(`#watch-engine-${t}`).value,ms:Number($(`#watch-time-${t}`).value),cores:Number($(`#watch-cores-${t}`).value)};}
function watchPool(t){const config=watchSettings(t);if(!watchPools[t]){$(`#watch-engine-status-${t}`).textContent=['atlas3','atlas4'].includes(config.engine)?engineName(config.engine)+' 사용':'선택 엔진 확인 중…';watchPools[t]=new AdaptiveEngine({workers:config.cores,engine:config.engine,onStatus:statusFor(`#watch-engine-status-${t}`)});}return watchPools[t];}
function cancelWatch(){for(const p of watchPools)p?.cancel();}
function disposeWatch(){for(const p of watchPools)p?.dispose();watchPools=[null,null];for(const t of [0,1])$(`#watch-engine-status-${t}`).textContent='선택한 엔진은 계산할 때 확인합니다.';}
const expectedDefense=(source,engine)=>defenseContinuation(source,records,past,decisionLog,engine);
const observedWallStreak=turn=>wallStreak(records,turn,baseState?.turn??0);
const watchOutcome=()=>observationOutcome(state,past);
const watcher=new SpectatorRunner({
  getState:()=>state,getOutcome:watchOutcome,
  search:(snapshot,onProgress)=>watchPool(snapshot.turn).search(searchSnapshot(snapshot),{ms:watchSettings(snapshot.turn).ms,wallStreak:observedWallStreak(snapshot.turn),defenseReply:expectedDefense(snapshot,watchSettings(snapshot.turn).engine),onProgress}),
  cancelSearch:cancelWatch,
  commit:(action,result)=>{const before=clone(state);applyMove(action);writeAnalysis(result,'선택',before);},
  onAnalysis:r=>writeAnalysis({...r,done:r.done??!watcher.thinking}),
  onChange:()=>{if(watching()){busy=watcher.thinking;render();}},
  onError:error=>{$('#analysis').textContent=error.message;},
  getDelay:()=>Number($('#watch-delay').value)
});
function analysisTrace(){return activeAnalysis?{...activeAnalysis,activeElapsedMs:variableAnalysis.elapsedMs,depth:variableAnalysis.latest?.depth??null,waiting:analysisReadiness(variableAnalysis,{suppressed:screenSuppressed()}),changedAt:variableAnalysis.changedAt?new Date(Date.now()-(performance.now()-variableAnalysis.changedAt)).toISOString():null}:lastAnalysisTrace;}
function stop(reason='control-change'){
 screenPonder.stop({clear:!['screen-position-changed','screen-auto','screen-uncertain','screen-uncertain-timeout'].includes(reason)});ponderStatus('idle');
 lastAnalysisTrace=analysisTrace();
 if(activeAnalysis&&variableAnalysis.active)recordDecision(decisionLog,{kind:'analysis-cancel',at:new Date().toISOString(),...lastAnalysisTrace,reason});
 activeAnalysis=null;clearTimeout(uncertaintyTimer);heldAnalysis=null;serial++;variableAnalysis.cancel();clearTimeout(ponderTimer);busy=false;watcher.pause();pool.cancel();cancelWatch();
}
const screenSuppressed=()=>$('#mode').value==='screen'&&screenCapture?.active&&!screenReady;
function wallSvg(w,extra=''){
  w=viewAction({...w,type:'wall'});const x=22+w.x*70,y=22+w.y*70;
  return `<rect class="wall ${extra}" x="${w.o==='h'?x-2:x+60}" y="${w.o==='h'?y+60:y-2}" width="${w.o==='h'?132:10}" height="${w.o==='h'?10:132}" rx="5" fill="${colors[w.owner??state.turn]}"/>`;
}
function drawBoard(){
  const can=human()&&!busy&&state.winner===null,options=can?moves(state):[],last=records.at(-1);
  let svg='<svg viewBox="0 0 664 664" role="img" aria-label="쿼리도 보드">';
  for(let y=0;y<9;y++)for(let x=0;x<9;x++){
    svg+=`<rect class="cell row${flipped()?8-y:y}" x="${22+x*70}" y="${22+y*70}" width="58" height="58" rx="9"/>`;
    if(x===0)svg+=`<text x="11" y="${56+y*70}">${flipped()?y+1:9-y}</text>`;
    if(y===8)svg+=`<text x="${51+x*70}" y="658">${'abcdefghi'[flipped()?8-x:x]}</text>`;
  }
  if(last?.type==='move'){
    const to=viewPosition(last),before=past.at(-1),from=viewPosition(before.p[before.turn]);
    svg+=`<line class="last-trail" x1="${51+from.x*70}" y1="${51+from.y*70}" x2="${51+to.x*70}" y2="${51+to.y*70}"/><circle class="last-origin" cx="${51+from.x*70}" cy="${51+from.y*70}" r="8"/><rect class="last-square" x="${22+to.x*70}" y="${22+to.y*70}" width="58" height="58" rx="9"/>`;
  }
  for(const move of options){const p=viewPosition(move);svg+=`<circle class="move-dot" cx="${51+p.x*70}" cy="${51+p.y*70}" r="9"/>`;}
  state.walls.forEach((w,i)=>{svg+=wallSvg(w,last?.type==='wall'&&i===state.walls.length-1?'last-wall':'');});
  state.p.forEach((position,t)=>{const p=viewPosition(position);svg+=`<circle class="pawn-ring" cx="${51+p.x*70}" cy="${51+p.y*70}" r="24" stroke="${colors[t]}"/><circle class="pawn" cx="${51+p.x*70}" cy="${51+p.y*70}" r="18" fill="${colors[t]}"/>`;});
  if(hint){if(hint.type==='wall')svg+=wallSvg(hint,'recommend');else{const p=viewPosition(hint);svg+=`<circle class="recommend" cx="${51+p.x*70}" cy="${51+p.y*70}" r="23" fill="none" stroke="#f4d18a" stroke-width="3"/>`;}}
  $('#board').innerHTML=svg+'<g id="ghost"></g></svg>';
}
function render(){
  variableStatus();
  const screen=$('#mode').value==='screen';screenCapture?.setVisible(screen);
  const watch=watching(),outcome=watch?watchOutcome():state.winner!==null?{type:'win',winner:state.winner}:null;
  $('#watch-panel').hidden=!watch;$('#human-settings').hidden=watch;$('#side-label').textContent=watch?'기준 진영':'내 진영';$('#position-label').textContent=watch?'기준 진영 시작 위치':'내 시작 위치';
  let status=outcome?.type==='win'?`${names[outcome.winner]} 승리!`:outcome?.type==='draw'?'관전 종료 · 무승부':busy?`${names[state.turn]} AI가 수를 읽고 있습니다…`:watch?(watcher.running?'다음 수를 기다리고 있습니다…':`${names[state.turn]} 차례 · 관전 일시정지`):human()?`${names[state.turn]}의 차례`:'AI의 차례';
  $('#status').textContent=status;
  $('#watch-state').textContent=outcome?'종료':watcher.thinking?'계산 중':watcher.running?'자동 진행':'일시정지';
  $('#watch-start').disabled=watcher.running||busy||!!outcome;
  $('#watch-pause').disabled=!watcher.running&&!watcher.thinking&&!busy;
  $('#watch-step').disabled=watcher.running||busy||!!outcome;
  for(const t of [0,1]){$(`#watch-cores-${t}`).disabled=$(`#watch-engine-${t}`).value==='atlas3';}
  $('#instruction').textContent=watch?'두 AI의 대국을 관전합니다 · 금색 표시는 방금 둔 수입니다':'점을 클릭해 이동 · 칸 사이에 커서를 대고 클릭해 벽 설치';
  $('#result').hidden=!outcome;
  if(outcome){$('#result').textContent=outcome.type==='win'?`${names[outcome.winner]} 승리 · ${records.length}수`:`관전 무승부 · ${outcome.reason==='repetition'?'같은 배치가 3회 반복되었습니다':'관전 최대 300수에 도달했습니다'}`;}
  drawBoard();
  $('#players').innerHTML=[Number($('#side').value),1-Number($('#side').value)].map(t=>{
    const title=watch?engineName(watchSettings(t).engine):$('#mode').value==='sandbox'?names[t]:screen?(t===Number($('#side').value)?'YOU':'상대 진영'):t===Number($('#side').value)?'YOU':'AI ENGINE';
    return `<div class="player ${state.turn===t&&!outcome?'active':''}" style="--accent:${colors[t]}"><div class="avatar">${t===0?'◉':'✦'}</div><div><b>${title}</b><small>${names[t]} · 목표까지 ${distance(state,t)}칸</small></div><div class="walls-count"><b>${state.left[t]}</b><small>WALLS</small><div>${'▏'.repeat(state.left[t])}</div></div></div>`;
  }).join('');
  $('#history').innerHTML=records.length?records.map((a,i)=>`<div class="${i===records.length-1?'latest':''}"><span>${String(i+1).padStart(2,'0')}</span><i style="background:${colors[(baseState?.turn??0)^(i%2)]}"></i><b>${notation(a)}</b><small>${a.type==='wall'?'벽 설치':'말 이동'}</small></div>`).join(''):baseState?'<p class="muted">가져온 시작 배치 · 이전 기보는 없습니다.</p>':'<p class="muted">첫 수를 기다리고 있습니다.</p>';
  $('#history').scrollTop=1e6;$('#count').textContent=`${records.length} 수`;$('#hint').disabled=busy||watcher.running||!!outcome;$('#undo').disabled=!past.length;
  $('#reset').disabled=screen;
  $('#side').disabled=screen;$('#start-position').disabled=screen;
  if(screen)$('#undo').disabled=true;
  if(baseState)$('#count').textContent=`가져온 배치 이후 ${records.length}수`;
  if(baseState&&screenRebased){$('#count').textContent=`재동기화 이후 ${records.length}수 · 중간 기보 누락`;if(!records.length)$('#history').innerHTML='<p class="muted">현재 화면에서 재동기화했습니다. 복원하지 못한 중간 기보는 만들지 않습니다.</p>';}
  if(screen){
    $('#hint').disabled=busy||!!outcome||!baseState||screenCapture?.active&&!screenReady;
    $('#status').textContent=!baseState?'화면 배치 대기':outcome?`화면 배치 · ${names[outcome.winner]} 승리`:`${screenCapture?.active?'화면 자동 연동':'확인한 화면 배치'} · ${names[state.turn]} 차례${busy?' · 분석 중':screenCapture?.active&&!screenReady?' · 변화 확인 중':''}`;
    $('#instruction').textContent=!baseState?'화면을 가져와 검토·적용하면 이 보드가 바뀝니다':screenCapture?.active?'자동 감시 중 · 안정된 합법 수를 반영하고 내 차례에 추천합니다':'자동 감시는 일시정지 상태입니다 · 화면 공유 후 감시 재개를 누르세요';
  }
}
function writeAnalysis(r,label='추천',source=state){
  if(!r.pv?.length)return;
  r={...r,progressReview:r.progressReview??progressReview(searchSnapshot(source),r.pv[0])};
  if(label==='추천'&&(source.turn!==state.turn||boardKey(source)!==boardKey(state)))return;
  if(label==='추천'){
    const settings=watching()?watchSettings(source.turn):{engine:$('#play-engine').value,ms:r.analysisBudgetMs??playMs(),cores:r.analysisCores??pool.size},enginePool=watching()?watchPool(source.turn):pool;
    recordDecision(decisionLog,recommendation(source,r,{...settings,ply:records.length+1,build:enginePool.native?.info?.engineInfo?.build}));
  }
  const strategyProof=r.winProof?.shortestWinProven===false;
  const recommended=r.pv[0];if(label==='추천')hint=recommended;$('#depth').textContent=strategyProof?'승리 전략 확인':r.exact?'후반 완전 탐색':`깊이 ${r.depth}`;
  $('#analysis-choice').textContent=`${label} ${notation(recommended)}`;
  const verdict=strategyProof?'승리 전략 확인':r.exact?(r.outcome===1?'정확한 승리':r.outcome===-1?'정확한 패배':'정확한 무승부'):'탐색 결과';
  $('#analysis').innerHTML=`<strong>${label} ${notation(recommended)}</strong><p>${r.pv.map(notation).join(' → ')}</p><small>${escapeHtml(r.engine??'AI')} · ${(r.nodes??0).toLocaleString()}개 노드 · ${verdict} · ${((r.elapsedMs??0)/1000).toFixed(1)}초</small>`;
  if(label==='추천'){const context=document.createElement('p');context.className='advice-context';context.textContent=`전체 ${records.length+1}수 · ${names[source.turn]} 차례 · ${r.done===true?'분석 완료':'계산 중 · 추천이 바뀔 수 있습니다'}`;$('#analysis').append(context);}
  if(strategyProof){const proof=document.createElement('p');proof.className='win-proof';const turns=Math.ceil(r.winProof.guaranteedPlies/2);proof.textContent=`${r.winProof.kind==='pawn-only-strategy'?'벽을 쓰지 않는 이동 승리 전략':'마지막 벽 사용 후의 승리 전략'} · 최대 내 ${turns}턴. 전체 행동 중 최단 승리 여부까지 증명한 결과는 아닙니다.`;$('#analysis').append(proof);}
  const warning=analysisRisk(r,source.turn);if(warning){const note=document.createElement('p');note.className='analysis-warning';note.setAttribute('role','status');note.textContent=warning;$('#analysis').append(note);}
  appendProgressReview(r.progressReview);
  appendWallSequence(r.weakWallConsumption);
  const explanation=pressureExplanation(source,recommended);if(explanation){const detail=document.createElement('p');detail.className='pressure-reason';detail.textContent=explanation;$('#analysis').append(detail);}
  if(r.reserveDefense?.active){const reserve=r.reserveDefense,note=document.createElement('p');note.className='pressure-reason';note.textContent=reserve.complete?`방어벽 보존 평가 · 내 벽 ${reserve.stock[source.turn]}개 / 상대 ${reserve.stock[1-source.turn]}개 · 단일 벽 위협 ${reserve.baselineRisk}칸 상당. 제한된 후보 평가이며 승패 증명은 아닙니다.`:'방어벽 보존 평가의 시간 예산을 넘겨 부분 결과는 적용하지 않았습니다.';$('#analysis').append(note);}
  if(r.weakWallConsumption?.active){const weak=r.weakWallConsumption,note=document.createElement('p');note.className='pressure-reason';note.textContent=weak.complete?`벽 소비 비교 · 관측된 연속 설치 ${weak.wallStreak}회 · 전진 가능한 이동과 비교해 약한 벽 ${weak.penalizedActions}개에 비용 반영${weak.selected?` · 선택 벽 비용 ${weak.selected.penalty}점`:''}`:'벽 소비 비교 시간 초과 · 부분 비용은 적용하지 않았습니다.';$('#analysis').append(note);}
  if(r.connectionRisk?.active&&!(r.threatDefense?.active&&r.threatDefense.complete)){const risk=r.connectionRisk,note=document.createElement('p');note.className='pressure-reason';note.textContent=risk.complete?`연결 벽 위험 추정 ${risk.estimate}${risk.defenseReview?` · 방어 대응 추가 검토 ${risk.initialEstimate}→${risk.estimate}`:''} · 첫 벽 → 내 합법 대응 → 연결 벽을 제한 탐색${risk.selected?` · 추천 후 추정 ${risk.selected.risk}`:''}. 생략된 공격·방어가 있어 안전·승패 증명이 아닙니다.`:'연결 벽 평가 시간 초과 · 부분 점수는 적용하지 않고 추가 분석을 유지합니다.';$('#analysis').append(note);}
  if(r.threatDefense?.active){const defense=r.threatDefense,note=document.createElement('p');note.className='pressure-reason';const selected=defense.selected;
   const line=selected?.line;note.textContent=!defense.complete?'공격·방어 응수 비교 시간 초과 · 부분 보정은 적용하지 않았습니다.':!selected?'현재 추천은 추가 위험 검토 후보 밖입니다. 충분히 검토됐다고 표시하지 않습니다.':`후속 공격·방어 비교 · 추천 후 위험 추정 ${selected.risk} · 후속 경로 증가 ${selected.delay}칸${line.attack?` · 상대 ${notation(line.attack)}`:''}${line.reply?` → 내 대응 ${notation(line.reply)}`:''}${line.followUp?` → 상대 ${notation(line.followUp)}`:''}${defense.continuationReviewed?` · 이전 대응안 ${notation(defense.continuation)}도 재비교했습니다.`:''} · 제한된 후보의 평가입니다.`;$('#analysis').append(note);
  }
}
function applyMove(action){
  if(!legal(state,action))throw Error('불가능한 수입니다.');
  const trace=analysisTrace();observedAction(decisionLog,state,action,records.length+1,trace?.position===boardKey(state)&&trace.turn===state.turn?trace:null);
  lastAnalysisTrace=null;
  past.push(clone(state));records.push(clone(action));state=apply(state,action);hint=null;$('#analysis-choice').textContent='추천 대기';busy=false;persist();render();
}
function commitMove(action){if(!legal(state,action))return;stop();applyMove(action);schedule();}
function schedule(){
  if($('#mode').value==='screen'){
    if(screenReady&&screenCapture?.active&&screenCapture.autoHint&&baseState&&state.winner===null&&state.turn===Number($('#side').value))think(false,'screen-auto');
    else if(screenReady&&screenCapture?.active&&screenCapture.autoHint&&baseState&&state.winner===null&&state.turn!==Number($('#side').value)&&['atlas5','atlas-goal','sigma'].includes($('#play-engine').value)){
     const source=clone(state),engine=$('#play-engine').value,selectedPool=pool;
     screenPonder.start(selectedPool,searchSnapshot(source),{
      valid:()=>screenReady&&screenCapture?.active&&screenCapture.autoHint&&$('#mode').value==='screen'&&$('#play-engine').value===engine&&pool===selectedPool&&state.turn===source.turn&&boardKey(state)===boardKey(source),
      prepare:(child,action)=>({state:searchSnapshot(child),options:{wallStreak:observedWallStreak(child.turn),defenseReply:defenseContinuation(child,[...records,action],[...past,source],decisionLog,engine)}}),
      onStatus:ponderStatus
     });
    }
    return;
  }
  if(watching()||state.winner!==null)return;
  if(!human())think(true);
  else if($('#mode').value==='ai'){
    clearTimeout(ponderTimer);const snapshot=clone(state);
    ponderTimer=setTimeout(()=>{if(!busy&&!watching())pool.search(snapshot,{ms:pool.ponderMs,ponder:true}).catch(()=>{});},200);
  }
}
function think(auto=false,reason='manual-analysis'){
  stop(reason);busy=true;clearAnalysis();const id=serial,source=clone(state),selectedPool=watching()?watchPool(state.turn):pool;
  render();$('#analysis').textContent='가능한 이동과 벽을 분석하고 있습니다…';
  if(!auto&&!watching()&&$('#time').value==='variable'){startVariable(selectedPool,source,id);return;}
  const prepared=searchSnapshot(state),defenseReply=expectedDefense(state,$('#play-engine').value),wallStreak=observedWallStreak(state.turn);
  const pondered=!watching()?screenPonder.take(selectedPool,prepared,{defenseReply,wallStreak}):null;
  selectedPool.search(prepared,{defenseReply:expectedDefense(state,$('#play-engine').value),wallStreak:observedWallStreak(state.turn),ms:watching()?watchSettings(state.turn).ms:playMs(),onProgress:()=>{}}).then(r=>{
    if(id!==serial)return;if(!r.pv?.length)throw Error('추천 가능한 수가 없습니다.');
    r=preferCompletedSearch(r,pondered);writeAnalysis({...r,done:true});busy=false;if(auto){commitMove(r.pv[0]);writeAnalysis(r,'선택',source);}else {persist();render();}
  }).catch(error=>{if(id!==serial||error.name==='AbortError')return;stop();render();$('#analysis').textContent=error.message;});
}
function variableStatus(){
 const v=variableAnalysis,visible=$('#time').value==='variable'&&!watching();
 const suppressed=screenSuppressed(),waiting=analysisReadiness(v,{suppressed});
 const updateTitles=()=>{for(const id of ['wait-label','wait-reason','wait-timing','advice-change','position-verdict']){const element=$('#'+id);element.title=element.textContent;}};
 $('#wait-advice').hidden=false;
 if(!visible||!v.active&&!v.displayed){
  $('#wait-advice').dataset.level=suppressed||busy?'wait':'done';
  const label=state.winner!==null?'대국 종료':suppressed?'화면 재확인 중':watching()?(watcher.thinking?'AI 대국 계산 중':watcher.running?'AI 대국 진행 중':'AI 대국 대기'):busy?'분석 중':$('#mode').value==='screen'&&!baseState?'화면 연결 대기':'분석 대기';
  if($('#wait-label').textContent!==label)$('#wait-label').textContent=label;
  $('#wait-reason').textContent=suppressed?'배치를 확인한 뒤 추천을 표시합니다.':watching()?'대국 진행과 선택한 수를 아래에서 확인하세요.':!visible?'분석 결과와 예상 진행을 아래에서 확인하세요.':'화면 배치를 확인하거나 최선 수 분석을 시작하세요.';
  $('#wait-timing').textContent='';$('#advice-change').hidden=true;$('#advice-change').textContent='';$('#position-verdict').textContent=state.winner!==null?`판세: ${names[state.winner]} 승리`:'판세: 분석 대기';
  $('#variable-controls').hidden=!visible;$('#analysis-pin').disabled=true;$('#analysis-pin').textContent='현재 추천 고정';$('#variable-status').textContent='';updateTitles();return;
 }
 if(!suppressed&&v.displayed&&activeAnalysis)activeAnalysis.lastVisibleWaiting=waiting;
 $('#wait-advice').dataset.level=waiting.level;if($('#wait-label').textContent!==waiting.label)$('#wait-label').textContent=waiting.label;$('#wait-reason').textContent=waiting.reason;
 const now=performance.now();
 $('#wait-timing').textContent=analysisTiming(v,now);
 const pinnedDifferent=v.pinned&&v.displayed&&v.latest&&notation(v.displayed.pv[0])!==notation(v.latest.pv[0]);
 $('#advice-change').hidden=suppressed||!pinnedDifferent&&(!v.previousAction||!v.changedAt||now-v.changedAt>5000);
 $('#advice-change').textContent=pinnedDifferent?`고정 추천 ${notation(v.displayed.pv[0])} / 최신 계산 ${notation(v.latest.pv[0])}`:v.previousAction&&v.displayed?`추천 변경: ${notation(v.previousAction)} → ${notation(v.displayed.pv[0])}`:'';
 const r=v.displayed;
 $('#position-verdict').textContent=suppressed?'':positionVerdict(r,pinnedDifferent);
 updateTitles();
 $('#variable-controls').hidden=!visible;$('#analysis-pin').disabled=true;
 if(suppressed){$('#analysis-pin').disabled=true;$('#variable-status').textContent='원본 배치 재확인 중 · 추천 표시 보류';return;}
 $('#analysis-pin').textContent='추천 자동 고정';
 $('#variable-status').textContent=!v.displayed?(v.active?'후보 비교 중 · 최대 2초 후 추천 확정':''):
  `추천 확정 · ${budgetReason(v.reason)} · ${notation(v.displayed.pv[0])} · 깊이 ${v.displayed.depth??0} · ${(v.elapsedMs/1000).toFixed(1)}초`;
 if(visible&&v.displayed){const context=$('#analysis .advice-context');if(context)context.textContent=`전체 ${records.length+1}수 · ${names[state.turn]} 차례 · ${v.pinned?'추천 고정 · ':''}${v.active?'추가 분석 중':'분석 완료'}`;}
}
function startVariable(selectedPool,source,id){
 const cores=Math.min(selectedPool.size,Math.max(1,(navigator.hardwareConcurrency||4)-1));
 const analysisId=globalThis.crypto.randomUUID();let published=false;
 activeAnalysis={analysisId,position:boardKey(source),turn:source.turn,engine:$('#play-engine').value};lastAnalysisTrace=null;
 const current=()=>id===serial&&source.turn===state.turn&&boardKey(source)===boardKey(state);
 recordDecision(decisionLog,{kind:'analysis-start',at:new Date().toISOString(),analysisId,position:boardKey(source),turn:source.turn,firstTargetMs:500,limitMs:2000,configuredCores:selectedPool.size,cores});
 const prepared=searchSnapshot(source),defenseReply=expectedDefense(source,$('#play-engine').value),wallStreak=observedWallStreak(source.turn);
 const initialResult=screenPonder.take(selectedPool,prepared,{defenseReply,wallStreak});if(initialResult)ponderStatus('reused');
 variableAnalysis.start(selectedPool,prepared,{cores,defenseReply,wallStreak,initialResult,
  onPublish:r=>{
   if(!current()||screenSuppressed())return;const position=boardKey(source),engine=$('#play-engine').value;
   if(lastShownAdvice&&lastShownAdvice.position===position&&lastShownAdvice.turn===source.turn&&lastShownAdvice.engine===engine&&notation(lastShownAdvice.action)!==notation(r.pv[0])){
    variableAnalysis.previousAction=lastShownAdvice.action;variableAnalysis.changedAt=performance.now();
    recordDecision(decisionLog,{kind:'recommendation-change',at:new Date().toISOString(),analysisId,position,turn:source.turn,from:clone(lastShownAdvice.action),to:clone(r.pv[0])});
   }
   lastShownAdvice={position,turn:source.turn,engine,action:clone(r.pv[0])};
   const phase=published?'update':'first';published=true;busy=false;writeAnalysis({...r,analysisBudgetMs:2000,analysisCores:cores});recordDecision(decisionLog,{kind:'analysis-display',at:new Date().toISOString(),analysisId,phase,position,turn:source.turn,pv:clone(r.pv),elapsedMs:r.elapsedMs,activeElapsedMs:variableAnalysis.elapsedMs,waiting:analysisReadiness(variableAnalysis),complete:r.done});persist();render();
  },
  onUpdate:r=>{if(!current())return;recordDecision(decisionLog,{...recommendation(source,r,{engine:$('#play-engine').value,ms:2000,cores,ply:records.length+1,build:selectedPool.native?.info?.engineInfo?.build}),kind:'analysis-update',analysisId,ponderReused:!!r.ponderReused,ponderMs:r.ponderMs??0});},
  onStatus:()=>{variableStatus();if(current()&&!variableAnalysis.active)persist();},
  onError:error=>{if(!current())return;stop();hint=null;render();$('#analysis').textContent=error.message;}
 });
}
$('#analysis-pin').onclick=()=>{variableAnalysis.togglePin();recordDecision(decisionLog,{kind:'recommendation-pin',at:new Date().toISOString(),position:boardKey(state),turn:state.turn,pinned:variableAnalysis.pinned});persist();};
function pick(e){
  const r=$('#board svg').getBoundingClientRect(),x=(e.clientX-r.left)*664/r.width,y=(e.clientY-r.top)*664/r.height;
  const gx=(x-22)/70,gy=(y-22)/70,cx=Math.floor(gx),cy=Math.floor(gy),fx=gx-cx,fy=gy-cy;
  if(cx<0||cy<0||cx>8||cy>8)return null;
  if(fx>58/70||fy>58/70){const o=fx>fy?'v':'h';let wx=cx,wy=cy;if(o==='h')wx=Math.round((x-22-65)/70);else wy=Math.round((y-22-65)/70);return viewAction({type:'wall',x:Math.max(0,Math.min(7,wx)),y:Math.max(0,Math.min(7,wy)),o});}
  return viewAction({type:'move',x:cx,y:cy});
}
$('#board').onpointermove=e=>{
  if(!human()||busy||state.winner!==null)return;const a=pick(e),preview=a?.type==='wall'?a:null;
  $('#ghost').innerHTML=preview?wallSvg({...preview,owner:state.turn},validWall(state,preview)?'ghost valid':'ghost invalid'):'';$('#board').style.cursor=a&&legal(state,a)?'pointer':'default';
};
$('#board').onpointerleave=()=>{if($('#ghost'))$('#ghost').innerHTML='';};
$('#board').onclick=e=>{if(human()&&!busy&&state.winner===null){const a=pick(e);if(a)commitMove(a);}};
function clearAnalysis(){$('#analysis').textContent='현재 차례의 추천 수와 예상 진행을 확인하세요.';$('#analysis-choice').textContent='추천 대기';$('#depth').textContent='';$('.analysis-scroll').scrollTop=0;hint=null;}
function resetGame(){stop();lastShownAdvice=null;lastAnalysisTrace=null;state=initial();baseState=null;observedBottom=null;screenRebased=false;screenSegments=[];decisionLog=[];past=[];records=[];clearAnalysis();persist();render();schedule();}
$('#hint').onclick=()=>think();$('#reset').onclick=resetGame;
$('#undo').onclick=()=>{stop();if(!past.length)return;do{state=past.pop();records.pop();}while($('#mode').value==='ai'&&past.length&&state.turn!==Number($('#side').value));clearAnalysis();persist();render();schedule();};
$('#mode').onchange=()=>{stop();clearAnalysis();persist();render();schedule();if($('#mode').value==='screen')screenCapture?.open();};
$('#side').onchange=()=>{stop();persist();render();schedule();};
$('#start-position').onchange=()=>{persist();render();};
$('#time').onchange=()=>{stop();persist();render();schedule();};
$('#cores').value=String(defaultCores);
$('#play-engine').onchange=$('#cores').onchange=()=>{stop();if($('#play-engine').value==='atlas3')$('#cores').value='1';$('#cores').disabled=$('#play-engine').value==='atlas3';pool.dispose();pool=createPlayPool(Number($('#cores').value));clearAnalysis();persist();render();schedule();};
for(const t of [0,1])for(const field of ['engine','time','cores'])$(`#watch-${field}-${t}`).onchange=()=>{
  stop();if($(`#watch-engine-${t}`).value==='atlas3')$(`#watch-cores-${t}`).value='1';disposeWatch();clearAnalysis();persist();render();
};
$('#watch-delay').onchange=()=>{stop();persist();render();};
$('#watch-start').onclick=()=>{stop();hint=null;watcher.start();};
$('#watch-pause').onclick=()=>{stop();render();};
$('#watch-step').onclick=()=>{stop();hint=null;watcher.step();};
function sessionData(){return {settingsRevision:1,version:baseState?3:2,...(baseState?{baseState,sourceBottom:observedBottom,screenRebased,screenSegments}:{}),records,decisionLog,mode:$('#mode').value,side:Number($('#side').value),startPosition:$('#start-position').value,time:$('#time').value,cores:$('#cores').value,engine:$('#play-engine').value,watch:{players:[watchSettings(0),watchSettings(1)],delay:Number($('#watch-delay').value)},result:watching()?watchOutcome():null};}
function persist(){try{localStorage.setItem('quoridor-session',JSON.stringify(sessionData()));$('#storage-note').hidden=true;}catch{$('#storage-note').hidden=false;$('#storage-note').textContent='자동 저장 공간이 부족합니다. 기보 저장을 이용해 주세요.';}}
function selectValue(id,value){const element=$(id);if([...element.options].some(option=>option.value===String(value)))element.value=String(value);}
function restore(data,{startup=false}={}){
  data=normalizeSessionSettings(data,{startup});lastShownAdvice=null;
  const replay=restoreObservedSession(data);const archives=data.screenSegments??[];if(!Array.isArray(archives)||archives.length>8)throw Error('이전 화면 기보 보관 형식이 올바르지 않습니다.');const segments=archives.map(segment=>{const r=restoreObservedSession(segment);return {baseState:r.baseState,records:r.records,decisionLog:Array.isArray(segment.decisionLog)?segment.decisionLog.slice(-1000):[]};});stop();lastAnalysisTrace=null;decisionLog=Array.isArray(data.decisionLog)?data.decisionLog.slice(-1000):[];screenSegments=segments;state=replay.state;past=replay.past;records=replay.records;baseState=replay.baseState;screenRebased=!!baseState&&data.screenRebased===true;
  observedBottom=baseState&&[0,1].includes(data.sourceBottom)?data.sourceBottom:null;screenCapture?.setBottom(observedBottom);
  selectValue('#mode',data.mode);selectValue('#side',data.side);selectValue('#time',data.time);selectValue('#cores',data.cores);selectValue('#play-engine',data.engine);
  $('#engine-import-note').hidden=!data.unsupportedEngine;$('#engine-import-note').textContent=data.unsupportedEngine?`기보의 원본 엔진 ${data.unsupportedEngine}은 선택 목록에서 제외됐습니다. 기록은 유지하고 새 분석에는 Atlas 0.4를 사용합니다.`:'';
  selectValue('#start-position',data.startPosition??'top');
  if($('#mode').value==='screen'&&observedBottom!==null){$('#side').value=String(observedBottom);$('#start-position').value='bottom';}
  if($('#play-engine').value==='atlas3')$('#cores').value='1';$('#cores').disabled=$('#play-engine').value==='atlas3';
  for(const t of [0,1]){const p=data.watch?.players?.[t];if(!p)continue;selectValue(`#watch-engine-${t}`,p.engine);selectValue(`#watch-time-${t}`,p.ms);selectValue(`#watch-cores-${t}`,p.cores);if($(`#watch-engine-${t}`).value==='atlas3')$(`#watch-cores-${t}`).value='1';}
  selectValue('#watch-delay',data.watch?.delay);pool.dispose();pool=createPlayPool(Number($('#cores').value));disposeWatch();clearAnalysis();persist();render();schedule();
}
$('#save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(sessionData(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=watching()?'quoridor-ai-vs-ai.json':'quoridor-game.json';a.click();URL.revokeObjectURL(url);};
$('#load').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{try{const file=e.target.files[0];if(file)restore(JSON.parse(await file.text()));}catch(error){alert(`불러오기 실패: ${error.message}`);}e.target.value='';};
screenCapture=mountScreenCapture({
  getState:()=>$('#mode').value==='screen'&&baseState?clone(state):null,
  onSync:(actions,before)=>{
    if($('#mode').value!=='screen'||state.turn!==before.turn||boardKey(state)!==boardKey(before))return false;
    stop('screen-position-changed');clearAnalysis();for(const action of actions)applyMove(action);screenReady=true;render();schedule();return true;
  },
  onWatchChange:()=>{screenReady=false;stop('screen-watch-change');clearAnalysis();render();},
  onUncertain:()=>{
   screenReady=false;clearTimeout(uncertaintyTimer);
   if($('#time').value==='variable'&&activeAnalysis&&(variableAnalysis.active||variableAnalysis.displayed)){
    heldAnalysis={...activeAnalysis,serial};recordDecision(decisionLog,{kind:'analysis-suspend-display',at:new Date().toISOString(),...analysisTrace(),reason:'screen-uncertain'});
    uncertaintyTimer=setTimeout(()=>{if(!screenReady){stop('screen-uncertain-timeout');clearAnalysis();render();}},300);
   }else stop('screen-uncertain');
   clearAnalysis();$('#analysis').textContent='원본 배치 변화 확인 중 · 확인 전에는 추천을 표시하지 않습니다.';render();
  },
  onRecovered:()=>{
   clearTimeout(uncertaintyTimer);screenReady=true;const held=heldAnalysis;heldAnalysis=null;
   if(held&&held.serial===serial&&held.position===boardKey(state)&&held.turn===state.turn&&held.engine===$('#play-engine').value){
    recordDecision(decisionLog,{kind:'analysis-resume-display',at:new Date().toISOString(),...analysisTrace(),reason:'same-position-confirmed'});
    if(variableAnalysis.displayed)variableAnalysis.publish();render();return;
   }
   render();schedule();
  },
  onApply:(snapshot,bottom)=>{lastShownAdvice=null;if(baseState&&records.length){screenSegments.push({baseState:clone(baseState),records:clone(records),decisionLog:clone(decisionLog)});if(screenSegments.length>8)screenSegments.shift();}screenRebased=!!baseState&&(screenRebased||boardKey(state)!==boardKey(snapshot)||state.turn!==snapshot.turn);stop();lastAnalysisTrace=null;state=clone(snapshot);baseState=clone(snapshot);decisionLog=[];observedBottom=bottom;past=[];records=[];$('#mode').value='screen';$('#side').value=String(bottom);$('#start-position').value='bottom';clearAnalysis();persist();render();},
  onDirty:()=>{if($('#mode').value==='screen'){stop();clearAnalysis();$('#analysis').textContent='새로 가져온 내용은 확인 후 적용해야 반영됩니다.';render();}}
});
const ponderNote=document.createElement('p');ponderNote.id='screen-ponder-status';ponderNote.className='watch-note';ponderNote.setAttribute('role','status');$('#screen-panel').append(ponderNote);ponderStatus('idle');
window.addEventListener('pagehide',()=>{stop();pool.dispose();disposeWatch();screenCapture?.dispose();});
try{const saved=localStorage.getItem('quoridor-session');if(saved)restore(JSON.parse(saved),{startup:true});else {persist();render();}}catch{render();}
