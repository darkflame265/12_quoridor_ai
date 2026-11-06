import {defenseContinuation} from '../ai/defense-continuation.js';
import {ScreenPonder} from '../ai/screen-ponder.js';
import {preferCompletedSearch} from '../ai/fixed-result.js';
import {progressSnapshot,progressReview} from '../ai/progress-review.js';
import {analysisReadiness,analysisTiming,positionVerdict} from '../ai/analysis-readiness.js';
import {wallStreak,wallRun} from '../game/wall-streak.js';
import {normalizeSessionSettings} from '../history/session-settings.js';
import {VariableAnalysis} from '../ai/variable-analysis.js';
import {AdaptiveEngine} from '../ai/adaptive-engine.js';
import {orientPosition,orientAction,viewFlipped} from '../game/view.js';
import {initial,clone,moves,validWall,legal,apply,notation,distance} from '../game/engine.js';
import {SpectatorRunner,observationOutcome} from '../ai/spectator.js';
import {mountScreenCapture} from '../capture/screen-capture.js';
import {restoreObservedSession} from '../capture/observed-state.js';
import {boardKey} from '../capture/screen-sync.js';
import {pressureExplanation} from '../ai/pressure-advice.js';
import {recommendation,recordDecision,observedAction} from '../history/decision-log.js';
import {analysisRisk} from '../ai/analysis-risk.js';
import {recommendationReason} from './recommendation-reason.js';
import {mountModePicker} from './mode-picker.js';
import {analysisDepth,analysisMetadata,analysisError} from './analysis-presentation.js';

const $=s=>document.querySelector(s),colors=['#31d4c2','#fa7393'],names=['청록','분홍'];
const syncModePicker=mountModePicker($('#mode'),$('#mode-picker'));
const defaultCores=1; // Transport compatibility, not a configurable CPU limit.
const entry=new URLSearchParams(location.search);
let storedSession=null;try{storedSession=localStorage.getItem('quoridor-session');}catch{}
let state=initial(),past=[],records=[],serial=0,busy=false,hint=null,decisionLog=[];
let autoAdviceActive=false;
let reviewPly=null,reviewHint=null;
let reviewPool=null,reviewAnalysis=null;
let reviewTimer=null;
const reviewCache=new Map();
let baseState=null,observedBottom=null,screenCapture=null;
let screenReady=false,screenRebased=false,screenSegments=[];
let uncertaintyTimer=null,heldAnalysis=null,activeAnalysis=null,lastAnalysisTrace=null,lastShownAdvice=null;
let pool=createPlayPool(defaultCores),opponentPool=null,watchPools=[null,null],ponderTimer=null;
let reasonWorker=null,reasonGeneration=0;
function clearRecommendationReason(){
 reasonGeneration++;reasonWorker?.terminate();reasonWorker=null;
 $('#analysis-reason').textContent='추천 수가 나오면 확인된 효과를 설명합니다.';$('#analysis-reason').title='';
 $('#readable-reason-detail')?.remove();
}
function showAnalysisError(error){
 clearRecommendationReason();hint=null;if(reviewPly!==null)reviewHint=null;
 const message=analysisError(error,{browser:import.meta.env?.VITE_BROWSER_AI==='1'});$('#analysis').textContent=message;$('#analysis-reason').textContent=message;$('#analysis-choice').textContent='분석 실패';
 $('#engine-meta').textContent=`최근 오류: ${String(error?.message??error)}`;drawBoard();
}
function showRecommendationReason(source,action){
 clearRecommendationReason();const id=reasonGeneration;
 const show=reason=>{
  if(id!==reasonGeneration||!reason)return;
  $('#analysis-reason').textContent=reason.summary;$('#analysis-reason').title=reason.summary;
  let detail=$('#readable-reason-detail');if(!detail){detail=document.createElement('div');detail.id='readable-reason-detail';$('#analysis').prepend(detail);}
  detail.replaceChildren();for(const text of [reason.summary,...reason.details]){const p=document.createElement('p');p.textContent=text;detail.append(p);}
 };
 show(recommendationReason(source,action));
 // Background evidence must never hold up the recommendation or board rendering.
 try{
  const worker=new Worker(new URL('./recommendation-reason-worker.js',import.meta.url),{type:'module'});reasonWorker=worker;
  worker.onmessage=({data})=>{if(data.id===id)show(data.reason);worker.terminate();if(reasonWorker===worker)reasonWorker=null;};
  worker.onerror=()=>{worker.terminate();if(reasonWorker===worker)reasonWorker=null;};
  worker.postMessage({id,state:source,action});
 }catch{/* The immediate factual explanation remains available without workers. */}
}
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
const browserAI=import.meta.env?.VITE_BROWSER_AI==='1';
const engineName=id=>(({'sigma2':'Sigma 2','sigma3':'Sigma 3','sigma4':'Sigma 4'})[id]??'Sigma 4')+(browserAI?' · Web':'');
function statusFor(selector){return (status,info)=>{
 const label=info?.engineInfo;
 if(selector==='#engine-status'&&label)$('#engine-meta').textContent=[label.label,label.version,label.build&&`빌드 ${label.build}`].filter(Boolean).join(' · ');
 if(selector==='#engine-status'||selector==='#opponent-status')$(selector).hidden=!['stale','unavailable','wasm','loading'].includes(status);
 if(status==='stale'){$(selector).textContent=`엔진 버전·빌드 불일치 · 실제 ${label?.version??'알 수 없음'} · ${label?.build??'빌드 확인 실패'} · 실행기를 다시 열어 갱신하세요`;return;}
 $(selector).textContent=status==='browser'?'내 기기에서 계산합니다':status==='loading'?'AI 모델 준비 중 · 첫 실행은 다운로드가 필요합니다':status==='native'?'연결됨':browserAI?'AI 준비에 실패했습니다. 연결을 확인한 뒤 다시 시도하세요.':'엔진에 연결하지 못했습니다. 쿼리도 앱을 실행한 뒤 다시 분석하세요.';
};}
function createPlayPool(workers){const engine=$('#play-engine').value;$('#engine-status').hidden=true;return new AdaptiveEngine({workers,engine,onStatus:statusFor('#engine-status')});}
function getOpponentPool(){const engine=$('#opponent-engine').value;if(!opponentPool||opponentPool.engine!==engine){opponentPool?.dispose();opponentPool=new AdaptiveEngine({workers:1,engine,onStatus:statusFor('#opponent-status')});}return opponentPool;}
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function watchSettings(t){return {engine:$(`#watch-engine-${t}`).value,ms:Number($(`#watch-time-${t}`).value),cores:Number($(`#watch-cores-${t}`).value)};}
function watchPool(t){const config=watchSettings(t);if(!watchPools[t]){$(`#watch-engine-status-${t}`).textContent='선택 엔진 확인 중…';watchPools[t]=new AdaptiveEngine({workers:config.cores,engine:config.engine,onStatus:statusFor(`#watch-engine-status-${t}`)});}return watchPools[t];}
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
  onError:showAnalysisError,
  getDelay:()=>Number($('#watch-delay').value)
});
function analysisTrace(){return activeAnalysis?{...activeAnalysis,activeElapsedMs:variableAnalysis.elapsedMs,depth:variableAnalysis.latest?.depth??null,waiting:analysisReadiness(variableAnalysis,{suppressed:screenSuppressed()}),changedAt:variableAnalysis.changedAt?new Date(Date.now()-(performance.now()-variableAnalysis.changedAt)).toISOString():null}:lastAnalysisTrace;}
function stop(reason='control-change'){
 clearTimeout(reviewTimer);reviewTimer=null;
 reviewPool?.dispose();reviewPool=null;reviewAnalysis=null;
 screenPonder.stop({clear:!['screen-position-changed','screen-auto','screen-uncertain','screen-uncertain-timeout'].includes(reason)});ponderStatus('idle');
 lastAnalysisTrace=analysisTrace();
 if(activeAnalysis&&variableAnalysis.active)recordDecision(decisionLog,{kind:'analysis-cancel',at:new Date().toISOString(),...lastAnalysisTrace,reason});
 activeAnalysis=null;clearTimeout(uncertaintyTimer);heldAnalysis=null;serial++;variableAnalysis.cancel();clearTimeout(ponderTimer);busy=false;autoAdviceActive=false;watcher.pause();pool.cancel();opponentPool?.cancel();cancelWatch();
}
const screenSuppressed=()=>$('#mode').value==='screen'&&screenCapture?.active&&!screenReady;
function wallSvg(w,extra=''){
  w=viewAction({...w,type:'wall'});const x=22+w.x*70,y=22+w.y*70;
  return `<rect class="wall ${extra}" x="${w.o==='h'?x-2:x+60}" y="${w.o==='h'?y+60:y-2}" width="${w.o==='h'?132:10}" height="${w.o==='h'?10:132}" rx="5" fill="${colors[w.owner??state.turn]}"/>`;
}
const liveState=()=>state;
function drawBoard(){
  const state=reviewPly===null?liveState():reviewPly===records.length?liveState():past[reviewPly];
  const can=reviewPly===null&&human()&&(!busy||autoAdviceActive)&&state.winner===null,options=can?moves(state):[],last=reviewPly===null?records.at(-1):records[reviewPly-1];
  let svg='<svg viewBox="0 0 664 664" role="img" aria-label="쿼리도 보드"><defs><filter id="pawn-depth" x="-40%" y="-40%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-opacity=".4"/></filter><linearGradient id="pawn-light" x2="0" y2="1"><stop stop-color="#fff" stop-opacity=".28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>';
  for(let y=0;y<9;y++)for(let x=0;x<9;x++){
    svg+=`<rect class="cell row${flipped()?8-y:y}" x="${22+x*70}" y="${22+y*70}" width="58" height="58" rx="9"/>`;
    if(x===0)svg+=`<text x="11" y="${56+y*70}">${flipped()?y+1:9-y}</text>`;
    if(y===8)svg+=`<text x="${51+x*70}" y="658">${'abcdefghi'[flipped()?8-x:x]}</text>`;
  }
  if(last?.type==='move'){
    const to=viewPosition(last),before=reviewPly===null?past.at(-1):past[reviewPly-1],from=before?viewPosition(before.p[before.turn]):to;
    svg+=`<line class="last-trail" x1="${51+from.x*70}" y1="${51+from.y*70}" x2="${51+to.x*70}" y2="${51+to.y*70}"/><circle class="last-origin" cx="${51+from.x*70}" cy="${51+from.y*70}" r="8"/><rect class="last-square" x="${22+to.x*70}" y="${22+to.y*70}" width="58" height="58" rx="9"/>`;
  }
  for(const move of options){const p=viewPosition(move);svg+=`<circle class="move-dot" cx="${51+p.x*70}" cy="${51+p.y*70}" r="9"/>`;}
  state.walls.forEach((w,i)=>{svg+=wallSvg(w,last?.type==='wall'&&i===state.walls.length-1?'last-wall':'');});
  state.p.forEach((position,t)=>{const p=viewPosition(position);svg+=`<circle class="pawn-ring" cx="${51+p.x*70}" cy="${51+p.y*70}" r="24" stroke="${colors[t]}"/><circle class="pawn" cx="${51+p.x*70}" cy="${51+p.y*70}" r="18" fill="${colors[t]}"/><circle class="pawn-sheen" cx="${51+p.x*70}" cy="${51+p.y*70}" r="17" fill="url(#pawn-light)"/>`;});
  const advice=reviewPly===null?hint:reviewHint;
  if(advice){if(advice.type==='wall')svg+=wallSvg({...advice,owner:state.turn},'recommend');else{const p=viewPosition(advice);svg+=`<circle class="recommend" cx="${51+p.x*70}" cy="${51+p.y*70}" r="23" fill="none" stroke="#f4d18a" stroke-width="3"/>`;}}
  $('#board').innerHTML=svg+'<g id="ghost"></g></svg>';
}
function render(){
  syncModePicker();
  variableStatus();
  $('#engine-current').textContent=engineName($('#play-engine').value);
  $('#app-status').textContent=$('#mode').value==='screen'?(screenCapture?.active?'화면 연결됨':'화면 연결 대기'):browserAI?'브라우저 AI · 내 기기에서 계산':'로컬 분석';
  const screen=$('#mode').value==='screen';screenCapture?.setVisible(screen);
  $('#opponent-settings').hidden=$('#mode').value!=='ai'||reviewPly!==null;
  $('#ai-auto-hint-setting').hidden=$('#mode').value!=='ai';
  $('#side-label').parentElement.hidden=screen;$('#position-label').parentElement.hidden=screen;
  const watch=watching(),outcome=watch?watchOutcome():state.winner!==null?{type:'win',winner:state.winner}:null;
  $('#watch-panel').hidden=!watch;$('#human-settings').hidden=watch&&reviewPly===null;$('#side-label').textContent=watch?'기준 진영':'내 진영';$('#position-label').textContent=watch?'기준 진영 시작 위치':'내 시작 위치';
  let status=outcome?.type==='win'?`${names[outcome.winner]} 승리!`:outcome?.type==='draw'?'관전 종료 · 무승부':busy?`${names[state.turn]} AI가 수를 읽고 있습니다…`:watch?(watcher.running?'다음 수를 기다리고 있습니다…':`${names[state.turn]} 차례 · 관전 일시정지`):human()?`${names[state.turn]}의 차례`:'AI의 차례';
  $('#status').textContent=status;
  $('#watch-state').textContent=outcome?'종료':watcher.thinking?'계산 중':watcher.running?'자동 진행':'일시정지';
  $('#watch-start').disabled=watcher.running||busy||!!outcome;
  $('#watch-pause').disabled=!watcher.running&&!watcher.thinking&&!busy;
  $('#watch-step').disabled=watcher.running||busy||!!outcome;
  for(const t of [0,1]){$(`#watch-cores-${t}`).disabled=false;}
  $('#instruction').textContent=watch?'두 AI의 대국을 관전합니다 · 금색 표시는 방금 둔 수입니다':'점을 클릭해 이동 · 칸 사이에 커서를 대고 클릭해 벽 설치';
  $('#result').hidden=true;
  if(outcome){$('#result').textContent=outcome.type==='win'?`${names[outcome.winner]} 승리 · ${records.length}수`:`관전 무승부 · ${outcome.reason==='repetition'?'같은 배치가 3회 반복되었습니다':'관전 최대 300수에 도달했습니다'}`;}
  drawBoard();
  const shownState=reviewPly===null?state:reviewPly===records.length?state:past[reviewPly];
  $('#players').innerHTML=[Number($('#side').value),1-Number($('#side').value)].map(t=>{
    const title=watch?engineName(watchSettings(t).engine):$('#mode').value==='sandbox'?names[t]:screen?(t===Number($('#side').value)?'YOU':'상대 진영'):t===Number($('#side').value)?'YOU':`상대 AI · ${engineName($('#opponent-engine').value)}`;
    return `<div class="player ${shownState.turn===t&&!outcome?'active':''}" style="--accent:${colors[t]}"><div class="avatar">${t===0?'◉':'✦'}</div><div><b>${title}</b><small>${names[t]} · 목표까지 ${distance(shownState,t)}칸</small></div><div class="walls-count"><b>${shownState.left[t]}</b><small>WALLS</small><div>${'▏'.repeat(shownState.left[t])}</div></div></div>`;
  }).join('');
  const userSide=Number($('#side').value),startSide=baseState?.turn??0,showOwners=!watching()&&$('#mode').value!=='sandbox';
  $('#history-legend').innerHTML=[0,1].map(side=>'<span class="history-legend-item side-'+side+'"><i aria-hidden="true"></i>'+(['청록','분홍'][side])+(showOwners?(side===userSide?' · 내 수':' · 상대 수'):'')+'</span>').join('');
  $('#history').innerHTML=records.length?records.map((a,i)=>{const side=(startSide+i)%2,who=showOwners?(side===userSide?'내 수':'상대 수'):side===0?'청록':'분홍';return '<button type="button" data-review-ply="'+(i+1)+'" aria-label="'+(i+1)+'수 '+who+' '+notation(a)+'" aria-current="'+(reviewPly===i+1?'step':'false')+'" class="history-entry side-'+side+' '+(reviewPly===i+1?'review-active':'')+'"><span>'+String(i+1).padStart(2,'0')+'</span><i class="history-side-bar" aria-hidden="true"></i><b>'+notation(a)+'</b><small>'+who+' · '+(a.type==='wall'?'벽 설치':'말 이동')+'</small></button>';}).join(''):'<p class="muted">첫 수를 기다리고 있습니다.</p>';
  $('#review-controls').hidden=!records.length;
  $('#review-position').textContent=reviewPly===null?'현재 대국':reviewPly+'수 직후 · 과거 기보';
  $('#review-prev').disabled=reviewPly===0;
  $('#review-next').disabled=reviewPly===null||reviewPly>=records.length;
  $('#review-now').disabled=reviewPly===null;
  if(reviewPly===null)$('#history').scrollTop=1e6;
  else{const selected=$('#history .review-active');if(selected){const list=$('#history'),a=selected.getBoundingClientRect(),b=list.getBoundingClientRect();if(a.top<b.top)list.scrollTop-=b.top-a.top;else if(a.bottom>b.bottom)list.scrollTop+=a.bottom-b.bottom;}}
  $('#count').textContent=`${records.length} 수`;$('#hint').disabled=reviewPly!==null||busy||watcher.running||!!outcome;$('#undo').disabled=reviewPly!==null||!past.length;
  $('#reset').disabled=screen;
  $('#side').disabled=screen;$('#start-position').disabled=screen;
  if(screen)$('#undo').disabled=true;
  if(baseState)$('#count').textContent=`가져온 배치 이후 ${records.length}수`;
  if(baseState&&screenRebased){$('#count').textContent=`재동기화 이후 ${records.length}수 · 중간 기보 누락`;if(!records.length)$('#history').innerHTML='<p class="muted">현재 화면에서 재동기화했습니다. 복원하지 못한 중간 기보는 만들지 않습니다.</p>';}
  if(screen){
    $('#hint').disabled=reviewPly!==null||busy||!!outcome||!baseState||screenCapture?.active&&!screenReady;
    $('#status').textContent=!baseState?'화면 배치 대기':outcome?`화면 배치 · ${names[outcome.winner]} 승리`:`${screenCapture?.active?'화면 자동 연동':'확인한 화면 배치'} · ${names[state.turn]} 차례${busy?' · 분석 중':screenCapture?.active&&!screenReady?' · 변화 확인 중':''}`;
    $('#instruction').textContent=!baseState?'화면을 가져와 검토·적용하면 이 보드가 바뀝니다':screenCapture?.active?'자동 감시 중 · 안정된 합법 수를 반영하고 내 차례에 추천합니다':'자동 감시는 일시정지 상태입니다 · 화면 공유 후 감시 재개를 누르세요';
  }
  $('#hint').textContent=reviewPly===null?'✦ 최선 수 분석':'↻ 다시 분석';
  const terminal=reviewPly===null&&outcome;
  $('#wait-advice').dataset.phase=terminal?'terminal':busy?'thinking':reviewPly!==null?'review':hint?'ready':'idle';
  if(terminal){
    $('#wait-advice').dataset.level='done';$('#analysis-choice').textContent=outcome.type==='win'?`${names[outcome.winner]} 승리 · ${records.length}수`:'관전 종료 · 무승부';
    $('#wait-label').textContent='대국 종료';$('#analysis-reason').textContent='기보에서 수를 선택하면 그 시점의 추천과 이유를 확인할 수 있습니다.';
    $('#depth').textContent='';$('#wait-reason').textContent='기보를 선택해 복기하세요.';$('#wait-timing').textContent='';$('#position-verdict').textContent='';$('#advice-change').hidden=true;$('#variable-controls').hidden=true;
    $('#instruction').textContent='대국이 끝났습니다 · 오른쪽 기보에서 중요한 순간을 다시 살펴보세요';
  }else if(!hint&&reviewPly===null&&!busy){
    $('#analysis-choice').textContent=screen&&!baseState?'게임 화면을 연결하세요':watch?'AI 대국 관전':human()?'다음 한 수를 살펴보세요':'상대의 차례';
    $('#analysis-reason').textContent=screen&&!baseState?'게임 화면 연결 버튼으로 보드를 가져오면 추천 분석이 시작됩니다.':watch?'두 엔진의 선택을 관찰하거나 기보를 선택해 복기할 수 있습니다.':human()?'최선 수 분석을 누르면 추천 위치와 선택 이유를 알려드립니다.':'상대의 수가 반영되면 현재 배치에서 분석할 수 있습니다.';
  }
  if(reviewPly!==null){
   const snapshot=reviewPly===records.length?state:past[reviewPly];
   $('#hint').disabled=busy||snapshot.winner!==null;
   $('#status').textContent=`기보 ${reviewPly}수 직후 · ${names[snapshot.turn]} 차례${busy?' · 분석 중':''}`;
   $('#instruction').textContent='과거 기보를 보고 있습니다 · 현재로를 누르면 실시간 배치로 돌아갑니다';
   $('#result').hidden=true;
  }
}
function writeAnalysis(r,label='추천',source=state){
  if(!r.pv?.length)return;
  r={...r,progressReview:r.progressReview??progressReview(searchSnapshot(source),r.pv[0])};
  if(label==='추천'&&(reviewPly!==null||source.turn!==state.turn||boardKey(source)!==boardKey(state)))return;
  if(label==='추천'){
    const enginePool=watching()?watchPool(source.turn):r.analysisRole==='opponent'?opponentPool:pool;
    const settings=watching()?watchSettings(source.turn):{engine:r.analysisEngineId??$('#play-engine').value,ms:r.analysisBudgetMs??playMs(),cores:r.analysisCores??enginePool?.size??1};
    recordDecision(decisionLog,recommendation(source,r,{...settings,ply:records.length+1,build:enginePool?.native?.info?.engineInfo?.build}));
  }
  const strategyProof=r.winProof?.shortestWinProven===false;
  const recommended=r.pv[0];if(label==='추천')hint=recommended;$('#depth').textContent=r.analysisRole==='opponent'?`상대 AI · ${engineName(r.analysisEngineId)}`:analysisDepth(r);
  $('#analysis-choice').textContent=`${label} ${notation(recommended)}`;
  $('#analysis').innerHTML=`<strong>${label} ${notation(recommended)}</strong><p>${r.pv.map(notation).join(' → ')}</p><small>${escapeHtml(analysisMetadata(r))}</small>`;
  showRecommendationReason(source,recommended);
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
  past.push(clone(state));records.push(clone(action));state=apply(state,action);hint=null;$('#analysis-choice').textContent='추천 대기';clearRecommendationReason();busy=false;persist();render();
}
function commitMove(action){if(!legal(state,action))return;stop();applyMove(action);schedule();}
function schedule(){
  if(reviewPly!==null){scheduleReview();return;}
  if(busy)return;
  if($('#mode').value==='screen'){
    if(screenReady&&screenCapture?.active&&screenCapture.autoHint&&baseState&&state.winner===null&&state.turn===Number($('#side').value))think(false,'screen-auto');
    else if(screenReady&&screenCapture?.active&&screenCapture.autoHint&&baseState&&state.winner===null&&state.turn!==Number($('#side').value)&&false){
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
    if($('#ai-auto-hint').checked){if(!hint)think(false,'ai-auto');return;}
    clearTimeout(ponderTimer);const snapshot=clone(state);
    ponderTimer=setTimeout(()=>{if(!busy&&!watching())pool.search(snapshot,{ms:pool.ponderMs,ponder:true}).catch(()=>{});},200);
  }
}
function think(auto=false,reason='manual-analysis'){
  stop(reason);busy=true;autoAdviceActive=reason==='ai-auto';clearAnalysis();const id=serial,source=clone(state),selectedPool=auto?getOpponentPool():watching()?watchPool(state.turn):pool;
  const selectedEngine=auto?$('#opponent-engine').value:watching()?watchSettings(state.turn).engine:$('#play-engine').value;
  const requestedMs=auto?($('#opponent-time').value==='variable'?2000:Number($('#opponent-time').value)):watching()?watchSettings(state.turn).ms:playMs();
  render();$('#analysis').textContent='가능한 이동과 벽을 분석하고 있습니다…';
  if(browserAI&&!selectedPool.native.online){$('#analysis-choice').textContent='AI 준비 중';$('#analysis-reason').textContent='첫 실행은 모델 다운로드·준비 시간이 필요합니다. 준비 후 내 기기에서 계산합니다.';}
  if(!auto&&!watching()&&$('#time').value==='variable'){startVariable(selectedPool,source,id);return;}
  const prepared=searchSnapshot(state),defenseReply=expectedDefense(state,selectedEngine),wallStreak=observedWallStreak(state.turn);
  const pondered=!auto&&!watching()?screenPonder.take(selectedPool,prepared,{defenseReply,wallStreak}):null;
  selectedPool.search(prepared,{defenseReply,wallStreak,ms:requestedMs,onProgress:()=>{}}).then(r=>{
    if(id!==serial)return;if(!r.pv?.length)throw Error('추천 가능한 수가 없습니다.');
    r={...preferCompletedSearch(r,pondered),analysisEngineId:selectedEngine,analysisRole:auto?'opponent':'analysis',analysisBudgetMs:requestedMs};writeAnalysis({...r,done:true});busy=false;if(auto){commitMove(r.pv[0]);if(!autoAdviceActive)writeAnalysis(r,'상대 선택',source);}else {persist();render();}
  }).catch(error=>{if(id!==serial||error.name==='AbortError')return;stop();render();showAnalysisError(error);});
}
function variableStatus(){
 if(reviewPly!==null){
  const phase=reviewAnalysis?.phase??'idle';
  $('#wait-advice').dataset.level=phase==='thinking'?'wait':'done';
  $('#wait-label').textContent=`기보 ${reviewPly}수 · ${phase==='thinking'?'분석 중':phase==='done'?'분석 완료':phase==='error'?'분석 실패':phase==='queued'?'자동 분석 대기':phase==='terminal'?'대국 종료':'분석 대기'}`;
  $('#wait-reason').textContent='선택한 시점의 배치만 분석합니다. 현재 대국의 추천과 구분됩니다.';
  $('#wait-timing').textContent=reviewAnalysis?.result?`${engineName(reviewAnalysis.engine)} · ${analysisMetadata(reviewAnalysis.result)}${reviewAnalysis.cached?' · 저장된 분석 재사용':''}`:'';
  $('#advice-change').hidden=true;$('#variable-controls').hidden=true;
  $('#position-verdict').textContent='과거 기보 분석 · 실시간 추천이 아닙니다';
  return;
 }
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
  `추천 확정 · ${notation(v.displayed.pv[0])} · ${analysisMetadata(v.displayed)}`;
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
  onError:error=>{if(!current())return;stop();render();showAnalysisError(error);}
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
  if(reviewPly!==null||!human()||busy&&!autoAdviceActive||state.winner!==null)return;const a=pick(e),preview=a?.type==='wall'?a:null;
  $('#ghost').innerHTML=preview?wallSvg({...preview,owner:state.turn},validWall(state,preview)?'ghost valid':'ghost invalid'):'';$('#board').style.cursor=a&&legal(state,a)?'pointer':'default';
};
$('#board').onpointerleave=()=>{if($('#ghost'))$('#ghost').innerHTML='';};
$('#board').onclick=e=>{if(reviewPly===null&&human()&&(!busy||autoAdviceActive)&&state.winner===null){const a=pick(e);if(a)commitMove(a);}};
function clearAnalysis(){clearRecommendationReason();$('#analysis').textContent='현재 차례의 추천 수와 예상 진행을 확인하세요.';$('#analysis-choice').textContent='추천 대기';$('#depth').textContent='';$('.analysis-scroll').scrollTop=0;hint=null;}
function resetGame(){reviewCache.clear();reviewPly=null;reviewHint=null;stop();lastShownAdvice=null;lastAnalysisTrace=null;state=initial();baseState=null;observedBottom=null;screenRebased=false;screenSegments=[];decisionLog=[];past=[];records=[];clearAnalysis();persist();render();schedule();}
function reviewSelect(n){stop('review-position-changed');clearAnalysis();reviewPly=Math.max(0,Math.min(records.length,n));const snap=reviewPly===records.length?state:past[reviewPly];const key=boardKey(snap);const saved=decisionLog.findLast(e=>e.kind==='recommendation'&&e.position===key&&e.turn===snap.turn&&e.pv?.[0]);reviewHint=saved?.pv[0]??null;$('#review-advice').textContent=saved?'당시 추천: '+notation(reviewHint)+' · '+(saved.engine??'AI'):'선택한 배치를 자동으로 분석합니다.';render();scheduleReview();}
$('#history').addEventListener('click',e=>{const item=e.target.closest('[data-review-ply]');if(item)reviewSelect(Number(item.dataset.reviewPly));});
$('#review-prev').onclick=()=>reviewSelect((reviewPly??records.length)-1);
$('#review-next').onclick=()=>reviewSelect((reviewPly??records.length)+1);
$('#review-now').onclick=()=>{stop('review-return-live');reviewPly=null;reviewHint=null;clearAnalysis();render();schedule();};
function reviewRequest(){
 const n=reviewPly,snapshot=clone(n===records.length?state:past[n]);
 const history=past.slice(0,n),actions=records.slice(0,n),engineId=$('#play-engine').value;
 const prepared={...progressSnapshot(snapshot,history),historyStates:history.slice(-48),wallRun:wallRun(actions,history,snapshot.turn,baseState?.turn??0),recentPawnSquares:history.filter(p=>p.turn===snapshot.turn).slice(-4).map(p=>p.p[snapshot.turn].y*9+p.p[snapshot.turn].x)};
 const pastLog=decisionLog.filter(e=>Number.isInteger(e.ply)&&e.ply<=n);
 const options={ms:$('#time').value==='variable'?2000:playMs(),wallStreak:wallStreak(actions,snapshot.turn,baseState?.turn??0),defenseReply:defenseContinuation(snapshot,actions,history,pastLog,engineId)};
 const cores=Number($('#cores').value);
 // History and continuation are part of the key: equal pawn squares alone
 // must never reuse advice from a different repetition or wall sequence.
 const key=JSON.stringify([n,engineId,$('#time').value,cores,pool.native?.info?.engineInfo?.build??null,prepared,options]);
 return {n,snapshot,engineId,prepared,options,cores,key};
}
function showReviewResult(result,request,cached=false){
 const {n,snapshot,engineId,prepared}=request;
 reviewHint=result.pv[0];reviewAnalysis={phase:'done',engine:engineId,result,cached};busy=false;
 writeAnalysis({...result,done:true,progressReview:progressReview(prepared,result.pv[0])},`기보 ${n}수 추천`,snapshot);
 $('#review-advice').textContent=`${engineName(engineId)} ${cached?'저장된 분석':'분석 결과'}를 아래 포지션 분석에서 확인하세요.`;render();
}
function scheduleReview(){
 clearTimeout(reviewTimer);reviewTimer=null;if(reviewPly===null)return;
 const request=reviewRequest();
 if(request.snapshot.winner!==null){reviewAnalysis={phase:'terminal'};$('#analysis-reason').textContent='이미 목표 줄에 도착해 대국이 끝난 배치입니다.';render();return;}
 if(reviewCache.has(request.key)){analyzeReview();return;}
 const id=serial,n=reviewPly;reviewAnalysis={phase:'queued',engine:request.engineId};render();
 reviewTimer=setTimeout(()=>{reviewTimer=null;if(serial===id&&reviewPly===n)analyzeReview();},150);
}
async function analyzeReview({force=false}={}){
 if(reviewPly===null||busy)return;
 stop('review-analysis');clearAnalysis();
 const id=serial,request=reviewRequest(),{n,snapshot,engineId,prepared,options,cores,key}=request;
 if(snapshot.winner!==null){render();return;}
 if(!force&&reviewCache.has(key)){const result=reviewCache.get(key);reviewCache.delete(key);reviewCache.set(key,result);showReviewResult(result,request,true);return;}
 const engine=new AdaptiveEngine({engine:engineId,workers:cores});reviewPool=engine;
 const current=()=>serial===id&&reviewPly===n&&$('#play-engine').value===engineId;
 reviewHint=null;reviewAnalysis={phase:'thinking',engine:engineId};busy=true;render();
 try{
  const result=await engine.search(prepared,options);
  if(!current())return;if(!result.pv?.[0]||!legal(snapshot,result.pv[0]))throw Error('선택한 배치에 대한 합법 추천을 얻지 못했습니다.');
  // Keep only this page's latest 32 position/settings combinations.
  const completedKey=reviewRequest().key;reviewCache.delete(completedKey);reviewCache.set(completedKey,structuredClone(result));
  while(reviewCache.size>32)reviewCache.delete(reviewCache.keys().next().value);
  showReviewResult(result,request);
 }catch(error){
  if(!current()||error.name==='AbortError')return;
  busy=false;reviewAnalysis={phase:'error',engine:engineId};showAnalysisError(error);render();
 }finally{engine.dispose();if(reviewPool===engine)reviewPool=null;}
}
$('#hint').onclick=()=>reviewPly===null?think():analyzeReview({force:true});$('#reset').onclick=resetGame;
$('#undo').onclick=()=>{stop();if(!past.length)return;do{state=past.pop();records.pop();}while($('#mode').value==='ai'&&past.length&&state.turn!==Number($('#side').value));clearAnalysis();persist();render();schedule();};
$('#mode').onchange=()=>{stop('mode-changed');reviewPly=null;reviewHint=null;clearAnalysis();persist();render();schedule();};
$('#side').onchange=()=>{stop();persist();render();schedule();};
$('#start-position').onchange=()=>{persist();render();};
$('#time').onchange=()=>{stop();clearAnalysis();persist();render();schedule();};
$('#ai-auto-hint').onchange=()=>{
  if($('#mode').value==='ai'&&reviewPly===null&&human()){stop('ai-auto-toggle');clearAnalysis();persist();render();schedule();}
  else{persist();render();}
};
$('#cores').value=String(defaultCores);
$('#play-engine').onchange=$('#cores').onchange=()=>{stop();$('#cores').disabled=false;pool.dispose();pool=createPlayPool(Number($('#cores').value));clearAnalysis();persist();render();schedule();};
$('#opponent-engine').onchange=$('#opponent-time').onchange=()=>{stop('opponent-settings-changed');opponentPool?.dispose();opponentPool=null;$('#opponent-status').hidden=true;clearAnalysis();persist();render();schedule();};
for(const t of [0,1])for(const field of ['engine','time','cores'])$(`#watch-${field}-${t}`).onchange=()=>{
  stop();disposeWatch();clearAnalysis();persist();render();
};
$('#watch-delay').onchange=()=>{stop();persist();render();};
$('#watch-start').onclick=()=>{stop();reviewPly=null;reviewHint=null;clearAnalysis();watcher.start();};
$('#watch-pause').onclick=()=>{stop();render();};
$('#watch-step').onclick=()=>{stop();reviewPly=null;reviewHint=null;clearAnalysis();watcher.step();};
function sessionData(){return {aiAutoHint:$('#ai-auto-hint').checked,runtime:browserAI?'browser-wasm':'python-local',settingsRevision:1,version:baseState?3:2,...(baseState?{baseState,sourceBottom:observedBottom,screenRebased,screenSegments}:{}),records,decisionLog,mode:$('#mode').value,side:Number($('#side').value),startPosition:$('#start-position').value,time:$('#time').value,cores:$('#cores').value,engine:$('#play-engine').value,opponent:{engine:$('#opponent-engine').value,time:$('#opponent-time').value},watch:{players:[watchSettings(0),watchSettings(1)],delay:Number($('#watch-delay').value)},result:watching()?watchOutcome():null};}
function persist(){try{localStorage.setItem('quoridor-session',JSON.stringify(sessionData()));$('#storage-note').hidden=true;}catch{$('#storage-note').hidden=false;$('#storage-note').textContent='자동 저장 공간이 부족합니다. 기보 저장을 이용해 주세요.';}}
function selectValue(id,value){const element=$(id);if(element.options&&[...element.options].some(option=>option.value===String(value)))element.value=String(value);else if(id==='#mode'){if(['ai','sandbox','watch','screen'].includes(String(value)))element.value=String(value);}else if(element.type==='hidden')element.value='1';}
function restore(data,{startup=false}={}){reviewCache.clear();reviewPly=null;reviewHint=null;
  data=normalizeSessionSettings(data,{startup});lastShownAdvice=null;
  const replay=restoreObservedSession(data);const archives=data.screenSegments??[];if(!Array.isArray(archives)||archives.length>8)throw Error('이전 화면 기보 보관 형식이 올바르지 않습니다.');const segments=archives.map(segment=>{const r=restoreObservedSession(segment);return {baseState:r.baseState,records:r.records,decisionLog:Array.isArray(segment.decisionLog)?segment.decisionLog.slice(-1000):[]};});stop();lastAnalysisTrace=null;decisionLog=Array.isArray(data.decisionLog)?data.decisionLog.slice(-1000):[];screenSegments=segments;state=replay.state;past=replay.past;records=replay.records;baseState=replay.baseState;screenRebased=!!baseState&&data.screenRebased===true;
  observedBottom=baseState&&[0,1].includes(data.sourceBottom)?data.sourceBottom:null;screenCapture?.setBottom(observedBottom);
  selectValue('#mode',data.mode);selectValue('#side',data.side);selectValue('#time',data.time);selectValue('#cores',data.cores);selectValue('#play-engine',data.engine);selectValue('#opponent-engine',data.opponent.engine);selectValue('#opponent-time',data.opponent.time);
  $('#ai-auto-hint').checked=data.aiAutoHint;
  $('#engine-import-note').hidden=!data.unsupportedEngine;$('#engine-import-note').textContent=data.unsupportedEngine?`기보의 원본 엔진 ${data.unsupportedEngine}은 선택 목록에서 제외됐습니다. 기록은 유지하고 새 분석에는 Sigma 4를 사용합니다.`:'';
  selectValue('#start-position',data.startPosition??'top');
  if($('#mode').value==='screen'&&observedBottom!==null){$('#side').value=String(observedBottom);$('#start-position').value='bottom';}
  $('#cores').disabled=false;
  for(const t of [0,1]){const p=data.watch?.players?.[t];if(!p)continue;selectValue(`#watch-engine-${t}`,p.engine);selectValue(`#watch-time-${t}`,p.ms);selectValue(`#watch-cores-${t}`,p.cores);}
  selectValue('#watch-delay',data.watch?.delay);opponentPool?.dispose();opponentPool=null;pool.dispose();pool=createPlayPool(Number($('#cores').value));disposeWatch();clearAnalysis();persist();render();schedule();
}
$('#save').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(sessionData(),null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=watching()?'quoridor-ai-vs-ai.json':'quoridor-game.json';a.click();URL.revokeObjectURL(url);};
$('#load').onclick=()=>$('#file').click();
$('#file').onchange=async e=>{try{const file=e.target.files[0];if(file)restore(JSON.parse(await file.text()));}catch(error){alert(`불러오기 실패: ${error.message}`);}e.target.value='';};
screenCapture=mountScreenCapture({
  getState:()=>$('#mode').value==='screen'&&baseState?clone(state):null,
  onSync:(actions,before,{ready=true}={})=>{
    if($('#mode').value!=='screen'||state.turn!==before.turn||boardKey(state)!==boardKey(before))return false;
    stop('screen-position-changed');clearAnalysis();for(const action of actions)applyMove(action);screenReady=ready;render();schedule();return true;
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
  onApply:(snapshot,bottom)=>{reviewCache.clear();reviewPly=null;reviewHint=null;lastShownAdvice=null;if(baseState&&records.length){screenSegments.push({baseState:clone(baseState),records:clone(records),decisionLog:clone(decisionLog)});if(screenSegments.length>8)screenSegments.shift();}screenRebased=!!baseState&&(screenRebased||boardKey(state)!==boardKey(snapshot)||state.turn!==snapshot.turn);stop();lastAnalysisTrace=null;state=clone(snapshot);baseState=clone(snapshot);decisionLog=[];observedBottom=bottom;past=[];records=[];$('#mode').value='screen';$('#side').value=String(bottom);$('#start-position').value='bottom';clearAnalysis();persist();render();},
  onDirty:()=>{if($('#mode').value==='screen'){stop();clearAnalysis();$('#analysis').textContent='새로 가져온 내용은 확인 후 적용해야 반영됩니다.';render();}}
});
const ponderNote=document.createElement('p');ponderNote.id='screen-ponder-status';ponderNote.hidden=true;ponderNote.className='watch-note';ponderNote.setAttribute('role','status');$('#screen-panel').append(ponderNote);ponderStatus('idle');
window.addEventListener('pagehide',()=>{clearRecommendationReason();stop();pool.dispose();opponentPool?.dispose();disposeWatch();screenCapture?.dispose();});
try{
  const data=storedSession?JSON.parse(storedSession):null;
  if(data)restore(entry.has('start')?{...data,mode:entry.get('start')==='play'?'ai':'screen'}:data,{startup:true});
  else{if(entry.get('start')==='play'||browserAI){$('#mode').value='ai';$('#side').value='0';$('#start-position').value='bottom';}persist();render();schedule();}
}catch{render();}
