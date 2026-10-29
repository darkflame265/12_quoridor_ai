import {AdaptiveEngine} from './adaptive-engine.js';
import {orientPosition,orientAction,viewFlipped} from './view.js';
import {initial,clone,moves,validWall,legal,apply,notation,distance} from './engine.js';
import {SpectatorRunner,observationOutcome} from './spectator.js';
import {mountScreenCapture} from './screen-capture.js';
import {restoreObservedSession} from './observed-state.js';
import {boardKey} from './screen-sync.js';
import {pressureExplanation} from './pressure-advice.js';

const $=s=>document.querySelector(s),colors=['#31d4c2','#fa7393'],names=['청록','분홍'];
for(const id of ['#play-engine','#watch-engine-0','#watch-engine-1']){const option=document.createElement('option');option.value='atlas-pressure';option.textContent='Atlas 즉시 압박 0.1 · 실험 (미승격)';$(id).add(option,2);}
const defaultCores=Math.min(4,Math.max(1,(navigator.hardwareConcurrency||4)-2));
let state=initial(),past=[],records=[],serial=0,busy=false,hint=null;
let baseState=null,observedBottom=null,screenCapture=null;
let screenReady=false,screenRebased=false,screenSegments=[];
let pool=createPlayPool(defaultCores),watchPools=[null,null],ponderTimer=null;
const watching=()=>$('#mode').value==='watch';
const human=()=>$('#mode').value==='sandbox'||$('#mode').value==='ai'&&state.turn===Number($('#side').value);
const flipped=()=>viewFlipped(Number($('#side').value),$('#start-position').value);
const viewPosition=p=>orientPosition(p,flipped());
const viewAction=a=>orientAction(a,flipped());
const engineName=id=>id==='atlas3'?'Atlas 3':id==='atlas5'?'Atlas 5.3 안정':id==='atlas-pressure'?'Atlas 즉시 압박 0.1 실험':id==='atlas-experiment'?'Atlas 실험 late-full':'Atlas 4 WASM';
function statusFor(selector){return (status,info)=>{const label=info?.engineInfo;$(selector).textContent=status==='atlas3'?'Atlas 3 사용':status==='atlas4'?'Atlas 4 WASM 사용':status==='native'?`${label?.label??'Atlas Native'} · ${label?.version??info.engine??'Native'}${label?.variant?' · '+label.variant:''}${label?.build?' · '+label.build:''}`:status==='unavailable'?'실험 엔진 사용 불가 · 다른 엔진으로 자동 대체하지 않습니다.':'Atlas 4 WASM 사용 (Native 연결 불가)';};}
function createPlayPool(workers){const engine=$('#play-engine').value;$('#engine-status').textContent=['atlas4','atlas3'].includes(engine)?(engine==='atlas3'?'Atlas 3':'Atlas 4 WASM')+' 사용':'선택 엔진 확인 중…';return new AdaptiveEngine({workers,engine,onStatus:statusFor('#engine-status')});}
const escapeHtml=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function watchSettings(t){return {engine:$(`#watch-engine-${t}`).value,ms:Number($(`#watch-time-${t}`).value),cores:Number($(`#watch-cores-${t}`).value)};}
function watchPool(t){const config=watchSettings(t);if(!watchPools[t]){$(`#watch-engine-status-${t}`).textContent=['atlas3','atlas4'].includes(config.engine)?engineName(config.engine)+' 사용':'선택 엔진 확인 중…';watchPools[t]=new AdaptiveEngine({workers:config.cores,engine:config.engine,onStatus:statusFor(`#watch-engine-status-${t}`)});}return watchPools[t];}
function cancelWatch(){for(const p of watchPools)p?.cancel();}
function disposeWatch(){for(const p of watchPools)p?.dispose();watchPools=[null,null];for(const t of [0,1])$(`#watch-engine-status-${t}`).textContent='선택한 엔진은 계산할 때 확인합니다.';}
const watchOutcome=()=>observationOutcome(state,past);
const watcher=new SpectatorRunner({
  getState:()=>state,getOutcome:watchOutcome,
  search:(snapshot,onProgress)=>watchPool(snapshot.turn).search(snapshot,{ms:watchSettings(snapshot.turn).ms,onProgress}),
  cancelSearch:cancelWatch,
  commit:(action,result)=>{const before=clone(state);applyMove(action);writeAnalysis(result,'선택',before);},
  onAnalysis:r=>writeAnalysis(r),
  onChange:()=>{if(watching()){busy=watcher.thinking;render();}},
  onError:error=>{$('#analysis').textContent=error.message;},
  getDelay:()=>Number($('#watch-delay').value)
});
function stop(){serial++;clearTimeout(ponderTimer);busy=false;watcher.pause();pool.cancel();cancelWatch();}
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
  const recommended=r.pv[0];if(label==='추천')hint=recommended;$('#depth').textContent=r.exact?'후반 완전 탐색':`깊이 ${r.depth}`;
  const verdict=r.exact?(r.outcome===1?'정확한 승리':r.outcome===-1?'정확한 패배':'정확한 무승부'):'탐색 결과';
  $('#analysis').innerHTML=`<strong>${label} ${notation(recommended)}</strong><p>${r.pv.map(notation).join(' → ')}</p><small>${escapeHtml(r.engine??'AI')} · ${(r.nodes??0).toLocaleString()}개 노드 · ${verdict} · ${((r.elapsedMs??0)/1000).toFixed(1)}초</small>`;
  const explanation=pressureExplanation(source,recommended);if(explanation){const detail=document.createElement('p');detail.className='pressure-reason';detail.textContent=explanation;$('#analysis').append(detail);}
}
function applyMove(action){
  if(!legal(state,action))throw Error('불가능한 수입니다.');
  past.push(clone(state));records.push(clone(action));state=apply(state,action);hint=null;busy=false;persist();render();
}
function commitMove(action){if(!legal(state,action))return;stop();applyMove(action);schedule();}
function schedule(){
  if($('#mode').value==='screen'){
    if(screenReady&&screenCapture?.active&&screenCapture.autoHint&&baseState&&state.winner===null&&state.turn===Number($('#side').value))think();
    return;
  }
  if(watching()||state.winner!==null)return;
  if(!human())think(true);
  else if($('#mode').value==='ai'){
    clearTimeout(ponderTimer);const snapshot=clone(state);
    ponderTimer=setTimeout(()=>{if(!busy&&!watching())pool.search(snapshot,{ms:pool.ponderMs,ponder:true}).catch(()=>{});},200);
  }
}
function think(auto=false){
  stop();busy=true;hint=null;const id=serial,source=clone(state),selectedPool=watching()?watchPool(state.turn):pool;
  render();$('#analysis').textContent='가능한 이동과 벽을 분석하고 있습니다…';
  selectedPool.search(state,{ms:watching()?watchSettings(state.turn).ms:Number($('#time').value),onProgress:r=>{if(id===serial)writeAnalysis(r);}}).then(r=>{
    if(id!==serial)return;if(!r.pv?.length)throw Error('추천 가능한 수가 없습니다.');
    writeAnalysis(r);busy=false;if(auto){commitMove(r.pv[0]);writeAnalysis(r,'선택',source);}else render();
  }).catch(error=>{if(id!==serial||error.name==='AbortError')return;stop();render();$('#analysis').textContent=error.message;});
}
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
function clearAnalysis(){$('#analysis').textContent='현재 차례의 추천 수와 예상 진행을 확인하세요.';$('#depth').textContent='';hint=null;}
function resetGame(){stop();state=initial();baseState=null;observedBottom=null;screenRebased=false;screenSegments=[];past=[];records=[];clearAnalysis();persist();render();schedule();}
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
function sessionData(){return {version:baseState?3:2,...(baseState?{baseState,sourceBottom:observedBottom,screenRebased,screenSegments}:{}),records,mode:$('#mode').value,side:Number($('#side').value),startPosition:$('#start-position').value,time:$('#time').value,cores:$('#cores').value,engine:$('#play-engine').value,watch:{players:[watchSettings(0),watchSettings(1)],delay:Number($('#watch-delay').value)},result:watching()?watchOutcome():null};}
function persist(){try{localStorage.setItem('quoridor-session',JSON.stringify(sessionData()));$('#storage-note').hidden=true;}catch{$('#storage-note').hidden=false;$('#storage-note').textContent='자동 저장 공간이 부족합니다. 기보 저장을 이용해 주세요.';}}
function selectValue(id,value){const element=$(id);if([...element.options].some(option=>option.value===String(value)))element.value=String(value);}
function restore(data){
  const replay=restoreObservedSession(data);const archives=data.screenSegments??[];if(!Array.isArray(archives)||archives.length>8)throw Error('이전 화면 기보 보관 형식이 올바르지 않습니다.');const segments=archives.map(segment=>{const r=restoreObservedSession(segment);return {baseState:r.baseState,records:r.records};});stop();screenSegments=segments;state=replay.state;past=replay.past;records=replay.records;baseState=replay.baseState;screenRebased=!!baseState&&data.screenRebased===true;
  observedBottom=baseState&&[0,1].includes(data.sourceBottom)?data.sourceBottom:null;screenCapture?.setBottom(observedBottom);
  selectValue('#mode',data.mode);selectValue('#side',data.side);selectValue('#time',data.time);selectValue('#cores',data.cores);selectValue('#play-engine',data.engine??'atlas5');
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
    stop();clearAnalysis();for(const action of actions)applyMove(action);screenReady=true;render();schedule();return true;
  },
  onWatchChange:()=>{screenReady=false;stop();clearAnalysis();render();},
  onUncertain:()=>{screenReady=false;stop();clearAnalysis();$('#analysis').textContent='원본 배치 변화 확인 중 · 인식이 안정되면 최신 배치를 분석합니다.';render();},
  onRecovered:()=>{screenReady=true;render();schedule();},
  onApply:(snapshot,bottom)=>{if(baseState&&records.length){screenSegments.push({baseState:clone(baseState),records:clone(records)});if(screenSegments.length>8)screenSegments.shift();}screenRebased=!!baseState&&(screenRebased||boardKey(state)!==boardKey(snapshot)||state.turn!==snapshot.turn);stop();state=clone(snapshot);baseState=clone(snapshot);observedBottom=bottom;past=[];records=[];$('#mode').value='screen';$('#side').value=String(bottom);$('#start-position').value='bottom';clearAnalysis();persist();render();},
  onDirty:()=>{if($('#mode').value==='screen'){stop();clearAnalysis();$('#analysis').textContent='새로 가져온 내용은 확인 후 적용해야 반영됩니다.';render();}}
});
window.addEventListener('pagehide',()=>{stop();pool.dispose();disposeWatch();screenCapture?.dispose();});
try{const saved=localStorage.getItem('quoridor-session');if(saved)restore(JSON.parse(saved));else render();}catch{render();}
