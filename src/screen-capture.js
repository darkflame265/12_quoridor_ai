import {recognizeBoard,gridGeometry} from './screen-recognition.js';
import {snapshotFromDraft,snapshotIssues,checkedSnapshot} from './observed-state.js';
import {recoverScreenSequence,StableScreenBoard,boardKey} from './screen-sync.js';
import {detectBoards,trackedBoard,gridFingerprint,retainedGridMatches} from './board-detection.js';
const colors=['#31d4c2','#fa7393'];
export function mountScreenCapture({onApply,onDirty,getState,onSync,onWatchChange,onUncertain,onRecovered}){
 const panel=document.createElement('section');panel.className='panel';panel.id='screen-panel';panel.hidden=true;
 panel.innerHTML='<div class="panel-title">화면 연동 <span>자동 감시</span></div><p class="watch-note">처음 배치·차례를 확인해 적용한 뒤 자동 감시를 시작하세요. 벽 미리보기가 남지 않도록 원본 보드 밖으로 커서를 옮겨 주세요.</p><button id="screen-open" class="primary">화면 연결 · 이미지 인식</button><div class="buttons"><button id="screen-disconnect" disabled>공유 중지</button></div><p id="screen-connection" class="watch-note" role="status">연결된 화면 없음</p>';
 document.querySelector('#watch-panel').before(panel);
 const liveControls=document.createElement('div');liveControls.innerHTML='<div class="buttons"><button id="screen-auto-start" disabled>자동 감시 시작</button><button id="screen-auto-pause" disabled>일시정지</button></div><label><input id="screen-auto-hint" type="checkbox" checked> 내 차례에 최선 수 자동 분석</label><p id="screen-auto-status" class="watch-note" role="status">배치를 확인해 적용한 뒤 자동 감시를 시작하세요.</p>';panel.append(liveControls);
 const recoveryControls=document.createElement('div');recoveryControls.innerHTML='<div class="buttons"><button id="screen-resync">현재 화면 재동기화</button><button id="screen-diagnostic">인식 진단 저장</button></div><p class="watch-note">진행을 복원하지 못하면 현재 배치·차례를 확인해 새 기준으로 적용하세요. 진단에는 최근 배치와 오류만 담고 영상은 담지 않습니다.</p>';panel.append(recoveryControls);
 const dialog=document.createElement('dialog');dialog.id='screen-dialog';dialog.className='screen-dialog';
 dialog.innerHTML=`<div class="screen-dialog-head"><div><h2>게임 화면 가져오기</h2><p>말·벽을 읽은 뒤 직접 확인해 적용하세요. 이미지는 이 브라우저에서 처리합니다.</p></div><button id="screen-close" aria-label="화면 가져오기 닫기">닫기</button></div>
 <div class="screen-workspace"><section class="screen-source"><div class="screen-actions"><button id="screen-connect">오른쪽 게임 화면 연결</button><button id="screen-image">이미지 가져오기</button><button id="screen-freeze" disabled>현재 프레임 고정</button><input id="screen-image-file" type="file" accept="image/png,image/jpeg,image/webp" hidden></div><p class="screen-help">공유할 게임 탭/창을 선택하세요. 마우스를 원본 보드 밖으로 옮겨 벽 미리보기를 지운 뒤 프레임을 고정하세요.</p><video id="screen-video" muted autoplay playsinline hidden></video><div id="screen-empty" class="screen-empty">화면을 연결하거나 PNG·JPG·WebP를 가져오세요.</div><canvas id="screen-source-canvas" hidden aria-label="원본 이미지: 9×9 칸의 바깥 모서리를 드래그해 보드 영역 선택"></canvas><p class="screen-help">숫자·글자·테두리를 제외하고, 첫 칸 왼쪽 위부터 마지막 칸 오른쪽 아래까지 드래그하세요.</p><label>칸 사이 간격 (%)<input id="screen-gap" type="number" min="6" max="30" step="1" value="16"></label><button id="screen-recognize" class="primary" disabled>선택 영역 인식</button><p id="screen-message" role="status" aria-live="polite" class="screen-help">먼저 화면이나 이미지를 준비하세요.</p></section>
 <section class="screen-review"><h3>인식 결과 검토·보정</h3><p class="screen-help">단색 청록·분홍 말/벽 테마를 우선 지원합니다. 점은 말로, 회색 미리보기는 벽으로 확정하지 않습니다.</p><div id="screen-review-board" aria-label="인식 배치 보정 보드"></div><label>클릭 보정<select id="screen-brush"><option value="p0">청록 말</option><option value="p1">분홍 말</option><option value="h0">청록 가로벽</option><option value="v0">청록 세로벽</option><option value="h1">분홍 가로벽</option><option value="v1">분홍 세로벽</option><option value="erase">벽 지우기</option></select></label><p id="screen-detected" class="screen-help"></p><div id="screen-wall-list"></div><button id="screen-clear-walls">보정 벽 전체 지우기</button><label>원본의 아래쪽 출발 진영<select id="screen-bottom"><option value="0">청록</option><option value="1">분홍</option></select></label><label>현재 차례 (직접 선택)<select id="screen-turn"><option value="0">청록</option><option value="1">분홍</option></select></label><label>청록 잔여 벽<input id="screen-left-0" type="number" min="0" max="10" value="10"></label><label>분홍 잔여 벽<input id="screen-left-1" type="number" min="0" max="10" value="10"></label><p class="screen-help">차례는 자동으로 읽지 않습니다. 잔여 벽은 설치된 벽 색으로 추정하므로 원본 숫자와 직접 대조하세요.</p><button id="screen-stock-reset">설치 벽으로 잔여 수 재계산</button><ul id="screen-issues" class="screen-issues"></ul><button id="screen-apply" class="primary" disabled>확인한 배치를 왼쪽에 적용</button></section></div>`;
 document.body.append(dialog);
 const detectionControls=document.createElement('div');detectionControls.innerHTML='<button id="screen-find-board">보드 자동 찾기</button><p id="screen-grid-status" class="screen-help" role="status">화면을 연결하면 보드와 칸 간격을 자동으로 찾습니다.</p><div id="screen-board-candidates"></div><label>세로 칸 간격 (%)<input id="screen-gap-y" type="number" min="6" max="30" step="0.01" value="16"></label>';
 document.getElementById('screen-recognize').before(detectionControls);document.getElementById('screen-gap').step='0.01';
 const $=id=>document.getElementById(id),canvas=$('screen-source-canvas'),ctx=canvas.getContext('2d'),frame=document.createElement('canvas'),video=$('screen-video');
 canvas.nextElementSibling.textContent='보드와 격자는 자동으로 찾습니다. 자동 탐지가 실패했거나 어긋났을 때만 9×9 칸의 바깥 모서리를 드래그해 보정하세요.';
 $('screen-gap').parentElement.firstChild.textContent='가로 칸 간격 (%)';
 const footer=document.createElement('div');footer.className='screen-dialog-foot';const footerNote=document.createElement('span');footerNote.textContent='검토 후 적용 · 차례와 잔여 벽은 원본과 대조하세요.';footer.append(footerNote,$('screen-apply'));dialog.append(footer);
 let stream=null,hasFrame=false,rect=null,drag=null,draft=null,manualStock=[false,false],visible=false,token=0,disposed=false,edited=false;
 let timer=null,calibration=null,uncertain=false,lastVideoTime=-1,lastFrameAt=0;const stable=new StableScreenBoard(3),live=document.createElement('canvas');
 let automaticGrid=false,lastGridCheck=0;
 let lastDraft=null,frameKey=null,frameCount=0;const observedFrames=[],diagnostics=[];
 function clearFrames(){observedFrames.length=0;frameKey=null;frameCount=0;}
 function recordDiagnostic(reason){const before=getState?.(),entry={time:new Date().toISOString(),reason,grid:calibration?{rect:calibration.rect,gap:calibration.gap}:null,lastGood:before??null,observed:lastDraft?{p:lastDraft.p,walls:lastDraft.walls,rawWallCount:lastDraft.rawWallCount,wallIssues:lastDraft.wallIssues,ownerCounts:[0,1].map(t=>lastDraft.walls.filter(w=>w.owner===t).length)}:null};if(diagnostics.at(-1)?.reason===reason&&JSON.stringify(diagnostics.at(-1)?.observed)===JSON.stringify(entry.observed))return;diagnostics.push(entry);if(diagnostics.length>40)diagnostics.shift();}
 function observedSnapshot(d,bottom,turn){lastDraft=d;if(d.wallIssues?.length)throw Error(`벽 후보 충돌 · ${d.wallIssues.join(' ')}`);const s=snapshotFromDraft(d,{bottom,turn});const counts=[0,1].map(t=>d.walls.filter(w=>w.owner===t).length);if(counts.some(n=>n>10))throw Error(`벽 과다 검출 · 청록 ${counts[0]}개 / 분홍 ${counts[1]}개 (각 최대 10개)`);return checkedSnapshot(s);}
 function recognizeLive(pixels){const before=getState?.(),bottom=calibration.bottom,knownWalls=(before?.walls??[]).map(w=>({...w,x:bottom===1?7-w.x:w.x,y:bottom===1?7-w.y:w.y}));return recognizeBoard(pixels,calibration.rect,{gap:calibration.gap,knownWalls});}
 const gaps=()=>({x:Number($('screen-gap').value)/100,y:Number($('screen-gap-y').value)/100});
 function boardCandidates(pixels){return detectBoards(pixels).filter(candidate=>recognizeBoard(pixels,candidate.rect,{gap:candidate.gap}).p.every(Boolean));}
 function selectBoard(candidate,pixels){
  dirty();rect={...candidate.rect};automaticGrid=true;$('screen-gap').value=(candidate.gap.x*100).toFixed(2);$('screen-gap-y').value=(candidate.gap.y*100).toFixed(2);
  draft=recognizeBoard(pixels,rect,{gap:gaps()});manualStock=[false,false];edited=false;stock();review();redraw();controls();$('screen-grid-status').textContent=`격자 자동 정렬 완료 · ${candidate.cells}/81칸 확인`;
  message('보드와 가로·세로 간격을 자동으로 찾았습니다. 말·벽·진영·차례를 확인하고 적용하세요.');
 }
 function findBoard(){
  if(!hasFrame)return;dirty();rect=null;automaticGrid=false;$('screen-board-candidates').replaceChildren();
  try{const pixels=frame.getContext('2d').getImageData(0,0,frame.width,frame.height),candidates=boardCandidates(pixels);
   if(candidates.length===1)selectBoard(candidates[0],pixels);
   else{redraw();controls();const text=candidates.length?'여러 보드를 찾았습니다. 사용할 보드를 선택하세요.':'보드를 확정하지 못했습니다. 전체 9×9 보드가 보이게 하거나 직접 영역을 드래그하세요.';$('screen-grid-status').textContent=text;message(text,true);
    candidates.forEach((candidate,i)=>{const button=document.createElement('button');button.textContent=`보드 ${i+1} · 위치 ${Math.round(candidate.rect.x)}, ${Math.round(candidate.rect.y)}`;button.onclick=()=>{selectBoard(candidate,pixels);$('screen-board-candidates').replaceChildren();};$('screen-board-candidates').append(button);});}
  }catch(error){message(error.message,true);}
 }
 const autoStatus=text=>{$('screen-auto-status').textContent=text;};
 function pause(reason='자동 감시 일시정지'){clearInterval(timer);timer=null;stable.reset();clearFrames();lastVideoTime=-1;onWatchChange?.(false);autoStatus(reason);controls();}
 function invalidate(){calibration=null;if(timer)pause('영역·배치를 변경했습니다. 검토 후 다시 적용하세요.');}
 function reject(text){stable.reset();frameCount=0;recordDiagnostic(text);autoStatus(`갱신 보류 · ${text}`);if(!uncertain){uncertain=true;onUncertain?.();}}
 function refreshGrid(pixels,w,h){
  lastGridCheck=Date.now();const found=trackedBoard(boardCandidates(pixels),calibration,w,h);
  if(!found){if(retainedGridMatches(pixels,calibration)){recordDiagnostic('전체 재탐지 실패 · 확인된 기존 격자를 모서리 색상 증거로 유지');return false;}throw Error('격자 추적 실패 · 전체 9×9 칸과 선택 대상을 확인하세요.');}
  const moved=Math.abs(found.rect.x-calibration.rect.x)>2||Math.abs(found.rect.y-calibration.rect.y)>2||Math.abs(found.rect.width-calibration.rect.width)>2||Math.abs(found.rect.height-calibration.rect.height)>2||w!==calibration.width||h!==calibration.height;
  if(moved){stable.reset();clearFrames();if(!uncertain){uncertain=true;onUncertain?.();}}
  calibration={...calibration,rect:found.rect,gap:found.gap,width:w,height:h,fingerprint:gridFingerprint(pixels,found)};return moved;
 }
 function tick(){
  if(!timer||!stream||!calibration||disposed)return;
  try{
   if(video.readyState<2||video.paused||video.currentTime===lastVideoTime){if(Date.now()-lastFrameAt>3000)reject('새 영상 프레임을 받지 못했습니다. 공유 상태를 확인하세요.');return;}
   lastVideoTime=video.currentTime;lastFrameAt=Date.now();
   const scale=Math.min(1,2048/Math.max(video.videoWidth,video.videoHeight)),w=Math.round(video.videoWidth*scale),h=Math.round(video.videoHeight*scale);
   if(!calibration.auto&&(w!==calibration.width||h!==calibration.height)){invalidate();autoStatus('공유 화면 크기가 바뀌었습니다. 프레임을 고정하고 영역을 다시 지정하세요.');onUncertain?.();return;}
   live.width=w;live.height=h;live.getContext('2d').drawImage(video,0,0,w,h);
   const pixels=live.getContext('2d').getImageData(0,0,w,h);
   let gridChecked=false;
   if(calibration.auto&&(Date.now()-lastGridCheck>=1000||w!==calibration.width||h!==calibration.height)){refreshGrid(pixels,w,h);gridChecked=true;}
   const detected=recognizeLive(pixels);
   const before=getState?.();if(!before){pause('배치를 다시 적용하세요.');return;}
   const target=observedSnapshot(detected,calibration.bottom,before.turn),key=boardKey(target);
   if(frameKey===key)frameCount++;else{frameKey=key;frameCount=1;}
   if(frameCount===2){observedFrames.push({time:Date.now(),board:target});while(observedFrames.length>24||observedFrames[0]?.time<Date.now()-6000)observedFrames.shift();}
   if(!stable.observe(target)){if(boardKey(before)!==boardKey(target)&&!uncertain){uncertain=true;onUncertain?.();}autoStatus('배치 변화 확인 중 · 동일한 화면 3회 대기');return;}
   // A whole-board translation by one cell can look like two legal pawn moves.
   // Confirm geometry on this very frame before committing any changed board.
   if(calibration.auto&&!gridChecked&&boardKey(before)!==boardKey(target)){
    const moved=refreshGrid(pixels,w,h),verified=observedSnapshot(recognizeLive(pixels),calibration.bottom,before.turn);
    if(moved||boardKey(verified)!==boardKey(target)){stable.reset();autoStatus('격자 재정렬 · 배치 안정화 확인 중');return;}
   }
   const actions=recoverScreenSequence(before,target,observedFrames.map(f=>f.board));
   if(actions.length){if(onSync?.(actions,before)===false)throw Error('왼쪽 배치가 변경됐습니다. 다시 확인하세요.');recordDiagnostic(`${actions.length}수 합법 진행 복원`);clearFrames();uncertain=false;autoStatus(`${actions.length}수 자동 반영 · ${new Date().toLocaleTimeString()}`);}
   else {if(uncertain){uncertain=false;onRecovered?.();}autoStatus('자동 감시 중 · 원본과 일치');}
  }catch(error){reject(error.message);}
 }
 function start(){if(!stream||!calibration)return;stable.reset();uncertain=true;lastVideoTime=-1;lastGridCheck=0;lastFrameAt=Date.now();timer=setInterval(tick,250);onWatchChange?.(true);autoStatus('자동 감시 시작 · 동일한 배치 3회 확인 후 반영');controls();}
 const message=(text,error=false)=>{$('screen-message').textContent=text;$('screen-message').classList.toggle('screen-error',error);};
 const dirty=()=>{invalidate();draft=null;$('screen-apply').disabled=true;$('screen-review-board').innerHTML='';$('screen-wall-list').replaceChildren();$('screen-detected').textContent='';$('screen-issues').replaceChildren();onDirty();};
 function controls(){const active=!!stream;$('screen-auto-start').disabled=!active||!calibration||!!timer;$('screen-auto-pause').disabled=!timer;$('screen-disconnect').disabled=!active;$('screen-freeze').disabled=!active;$('screen-connect').disabled=!navigator.mediaDevices?.getDisplayMedia;$('screen-recognize').disabled=!hasFrame||!rect;$('screen-connection').textContent=active?timer?'공유 중 · 자동 감시 활성':'공유 중 · 자동 감시는 일시정지':hasFrame?'마지막 프레임/이미지 · 실시간 갱신 없음':'연결된 화면 없음';}
 function disconnect(notify=true){pause('화면 공유 중지 · 자동 감시 종료');calibration=null;token++;const old=stream;stream=null;video.srcObject=null;video.hidden=true;old?.getTracks().forEach(t=>t.stop());controls();if(notify)onDirty();}
 function redraw(){
  if(!hasFrame)return;ctx.clearRect(0,0,canvas.width,canvas.height);ctx.drawImage(frame,0,0);
  if(rect){ctx.save();ctx.strokeStyle='#f4d18a';ctx.lineWidth=Math.max(2,canvas.width/600);ctx.strokeRect(rect.x,rect.y,rect.width,rect.height);try{const g=gridGeometry(rect,gaps());ctx.strokeStyle='#31d4c277';ctx.lineWidth=1;for(let y=0;y<9;y++)for(let x=0;x<9;x++){const c=g.cell(x,y);ctx.strokeRect(c.x,c.y,c.width,c.height);}}catch{}ctx.restore();}
 }
 function setFrame(source,width,height,keepRect=false){
  if(width<1||height<1)throw Error('화면 크기를 읽지 못했습니다.');const scale=Math.min(1,2048/Math.max(width,height)),w=Math.round(width*scale),h=Math.round(height*scale);
  if(!keepRect||frame.width!==w||frame.height!==h)rect=null;
  frame.width=w;frame.height=h;frame.getContext('2d').drawImage(source,0,0,w,h);canvas.width=w;canvas.height=h;hasFrame=true;canvas.hidden=false;$('screen-empty').hidden=true;dirty();redraw();controls();findBoard();
 }
 function freeze(){if(!stream||video.readyState<2)throw Error('연결된 화면을 아직 읽을 수 없습니다.');setFrame(video,video.videoWidth,video.videoHeight,true);}
 async function connect(){
  const mine=++token;let next=null;dirty();message('공유할 게임 탭 또는 창을 선택하세요.');
  try{
   if(!navigator.mediaDevices?.getDisplayMedia)throw Error('화면 공유를 사용할 수 없습니다. 이미지 가져오기를 이용하세요.');
   next=await navigator.mediaDevices.getDisplayMedia({video:true,audio:false});
   if(disposed||mine!==token){next.getTracks().forEach(t=>t.stop());return;}
   const old=stream;stream=next;old?.getTracks().forEach(t=>t.stop());video.srcObject=next;video.hidden=false;controls();
   next.getVideoTracks()[0].addEventListener('ended',()=>{if(stream===next){disconnect();message('화면 공유가 종료됐습니다. 마지막 프레임은 다시 검토할 수 있습니다.');}});
   await video.play();if(disposed||mine!==token||stream!==next)return;rect=null;freeze();
  }catch(error){if(next&&stream!==next)next.getTracks().forEach(t=>t.stop());if(mine===token)message(error.name==='NotAllowedError'?'화면 공유가 취소됐거나 허용되지 않았습니다. 다시 연결하거나 이미지를 가져오세요.':error.message,true);controls();}
 }
 async function imageFile(file){
  if(!file)return;if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>32*1024*1024){message('32MB 이하 PNG·JPG·WebP 파일을 선택하세요.',true);return;}
  disconnect(false);const mine=token;dirty();hasFrame=false;rect=null;canvas.hidden=true;$('screen-empty').hidden=false;$('screen-board-candidates').replaceChildren();controls();message('이미지를 읽고 있습니다…');let bitmap;
  try{bitmap=await createImageBitmap(file);if(!disposed&&token===mine)setFrame(bitmap,bitmap.width,bitmap.height);}catch(error){if(token===mine)message(`이미지를 읽지 못했습니다: ${error.message}`,true);}finally{bitmap?.close();}
 }
 const point=e=>{const box=canvas.getBoundingClientRect();return {x:Math.max(0,Math.min(canvas.width,(e.clientX-box.left)*canvas.width/box.width)),y:Math.max(0,Math.min(canvas.height,(e.clientY-box.top)*canvas.height/box.height))};};
 canvas.onpointerdown=e=>{if(!hasFrame)return;automaticGrid=false;$('screen-board-candidates').replaceChildren();$('screen-grid-status').textContent='수동 영역 보정 · 자동 추적을 사용하려면 보드 자동 찾기를 누르세요.';canvas.setPointerCapture(e.pointerId);drag=point(e);rect=null;dirty();};
 canvas.onpointermove=e=>{if(!drag)return;const p=point(e);rect={x:Math.min(drag.x,p.x),y:Math.min(drag.y,p.y),width:Math.abs(p.x-drag.x),height:Math.abs(p.y-drag.y)};redraw();};
 canvas.onpointerup=e=>{if(!drag)return;const p=point(e);rect={x:Math.min(drag.x,p.x),y:Math.min(drag.y,p.y),width:Math.abs(p.x-drag.x),height:Math.abs(p.y-drag.y)};drag=null;redraw();controls();message('격자가 칸과 맞는지 확인한 뒤 영역을 인식하세요.');};
 canvas.onpointercancel=()=>{drag=null;rect=null;redraw();controls();};
 function stock(){if(!draft)return;for(const t of [0,1])if(!manualStock[t])$(`screen-left-${t}`).value=String(10-draft.walls.filter(w=>w.owner===t).length);}
 function readSnapshot(){return snapshotFromDraft(draft,{bottom:Number($('screen-bottom').value),turn:Number($('screen-turn').value),left:[0,1].map(t=>$(`screen-left-${t}`).value.trim()===''?NaN:Number($(`screen-left-${t}`).value))});}
 function review(){
  if(!draft)return;const issues=[...snapshotIssues(readSnapshot()),...(!edited?draft.wallIssues??[]:[])];$('screen-issues').replaceChildren(...issues.map(text=>{const li=document.createElement('li');li.textContent=text;return li;}));$('screen-apply').disabled=issues.length>0;
  let svg='<svg viewBox="0 0 400 400" role="img" aria-label="원본 방향의 배치 보정: 클릭해 말 또는 벽 지정">';
  for(let y=0;y<9;y++)for(let x=0;x<9;x++)svg+=`<rect x="${10+x*42}" y="${10+y*42}" width="34" height="34" rx="5" fill="#29271f"/><text x="${27+x*42}" y="${22+y*42}" font-size="7">${x+1}·${y+1}</text>`;
  for(const w of draft.walls)svg+=`<rect x="${10+w.x*42+(w.o==='v'?35:0)}" y="${10+w.y*42+(w.o==='h'?35:0)}" width="${w.o==='h'?76:6}" height="${w.o==='v'?76:6}" rx="3" fill="${colors[w.owner]}"/>`;
  draft.p.forEach((p,t)=>{if(p)svg+=`<circle cx="${27+p.x*42}" cy="${27+p.y*42}" r="13" fill="${colors[t]}" stroke="#fff9"/>`;});$('screen-review-board').innerHTML=svg+'</svg>';
  $('screen-detected').textContent=`벽 ${draft.walls.length}개 · 자동 말 후보 청록 ${draft.candidates[0].length}/분홍 ${draft.candidates[1].length}${edited?' · 수동 보정됨':''}${draft.notes.length?' · '+draft.notes.join(' '):''}`;
  $('screen-wall-list').replaceChildren(...draft.walls.map((w,i)=>{const row=document.createElement('div'),label=document.createElement('span'),button=document.createElement('button');label.textContent=`${w.owner===0?'청록':'분홍'} ${w.o==='h'?'가로':'세로'}벽 · ${w.x+1}열 ${w.y+1}행`;button.textContent='삭제';button.onclick=()=>{draft.walls.splice(i,1);edited=true;stock();onDirty();review();};row.append(label,button);return row;}));
 }
 $('screen-review-board').onclick=e=>{
  if(!draft)return;const svg=$('screen-review-board').querySelector('svg'),box=svg.getBoundingClientRect(),x=(e.clientX-box.left)*400/box.width,y=(e.clientY-box.top)*400/box.height,brush=$('screen-brush').value;
  if(brush[0]==='p')draft.p[Number(brush[1])]={x:Math.max(0,Math.min(8,Math.round((x-27)/42))),y:Math.max(0,Math.min(8,Math.round((y-27)/42)))};
  else if(brush==='erase'){
   let best=-1,score=Infinity;draft.walls.forEach((w,i)=>{const ax=10+w.x*42,ay=10+w.y*42,dx=w.o==='h'?Math.max(ax-x,0,x-ax-76):Math.abs(x-ax-38),dy=w.o==='v'?Math.max(ay-y,0,y-ay-76):Math.abs(y-ay-38),d=Math.hypot(dx,dy);if(d<score&&d<14){best=i;score=d;}});if(best>=0)draft.walls.splice(best,1);
  }else{const w={type:'wall',o:brush[0],owner:Number(brush[1]),x:Math.max(0,Math.min(7,Math.round((x-48)/42))),y:Math.max(0,Math.min(7,Math.round((y-48)/42)))},old=draft.walls.findIndex(a=>a.x===w.x&&a.y===w.y&&a.o===w.o);if(old>=0)draft.walls[old]=w;else draft.walls.push(w);}
  edited=true;stock();onDirty();review();
 };
 $('screen-recognize').onclick=()=>{try{if(!rect||rect.width<180||rect.height<180)throw Error('보드 영역을 180×180 픽셀 이상으로 선택하세요.');draft=recognizeBoard(frame.getContext('2d').getImageData(0,0,frame.width,frame.height),rect,{gap:gaps()});manualStock=[false,false];edited=false;stock();review();onDirty();message('자동 판독을 마쳤습니다. 말·벽·출발 방향·차례·잔여 벽을 검토하고 적용하세요.');}catch(error){dirty();message(error.message,true);}};
 $('screen-find-board').onclick=findBoard;
 for(const id of ['screen-gap','screen-gap-y'])$(id).oninput=()=>{automaticGrid=false;dirty();redraw();controls();};
 for(const id of ['screen-bottom','screen-turn'])$(id).onchange=()=>{onDirty();review();};
 for(const t of [0,1])$(`screen-left-${t}`).oninput=()=>{manualStock[t]=true;onDirty();review();};
 $('screen-stock-reset').onclick=()=>{manualStock=[false,false];stock();onDirty();review();};
 $('screen-clear-walls').onclick=()=>{if(draft){draft.walls=[];edited=true;stock();onDirty();review();}};
 $('screen-apply').onclick=()=>{try{if(!edited&&draft?.wallIssues?.length)throw Error(draft.wallIssues.join(' '));const snapshot=checkedSnapshot(readSnapshot());pause();onApply(snapshot,Number($('screen-bottom').value));calibration={rect:{...rect},gap:gaps(),auto:automaticGrid,bottom:Number($('screen-bottom').value),width:frame.width,height:frame.height,fingerprint:gridFingerprint(frame.getContext('2d').getImageData(0,0,frame.width,frame.height),{rect,gap:gaps()})};recordDiagnostic('사용자가 현재 배치·차례를 확인해 기준 상태 적용');controls();dialog.close();message('확인한 배치를 적용했습니다. 공유 중이면 자동 감시 시작을 눌러 연동하세요.');}catch(error){message(error.message,true);review();}};
 $('screen-auto-start').onclick=()=>{if(!timer)start();};$('screen-auto-pause').onclick=()=>pause();$('screen-auto-hint').onchange=()=>{stable.reset();uncertain=true;onWatchChange?.(!!timer);};
 // Editing an approved draft invalidates its calibration before it can be reused.
 dialog.addEventListener('input',e=>{if(e.target.id!=='screen-image-file'){invalidate();controls();}});
 dialog.addEventListener('change',()=>{invalidate();controls();});
 $('screen-review-board').addEventListener('click',()=>{invalidate();controls();});$('screen-wall-list').addEventListener('click',()=>{invalidate();controls();});$('screen-clear-walls').addEventListener('click',()=>{invalidate();controls();});$('screen-stock-reset').addEventListener('click',()=>{invalidate();controls();});
 function openDialog(){if(timer){pause('배치 검토를 위해 일시정지했습니다. 검토·적용 후 감시를 다시 시작하세요.');try{freeze();}catch(error){message(error.message,true);}}if(!dialog.open)dialog.showModal();controls();}
 $('screen-open').onclick=openDialog;$('screen-close').onclick=()=>dialog.close();$('screen-connect').onclick=()=>connect();$('screen-freeze').onclick=()=>{try{freeze();}catch(e){message(e.message,true);}};
 $('screen-resync').onclick=()=>{const wasActive=!!timer;openDialog();if(!wasActive&&stream)try{freeze();}catch(error){message(error.message,true);}message('현재 배치와 차례를 확인해 새 기준으로 적용하세요. 복원하지 못한 중간 수는 만들지 않습니다.');};
 $('screen-diagnostic').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify({version:1,events:diagnostics,buffer:observedFrames,lastGood:getState?.()??null},null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='quoridor-screen-diagnostic.json';a.click();URL.revokeObjectURL(url);};
 $('screen-disconnect').onclick=()=>disconnect();$('screen-image').onclick=()=>$('screen-image-file').click();$('screen-image-file').onchange=e=>{imageFile(e.target.files[0]);e.target.value='';};controls();
 return {get active(){return !!timer;},get autoHint(){return $('screen-auto-hint').checked;},open:openDialog,setBottom(bottom){invalidate();if([0,1].includes(bottom)){$('screen-bottom').value=String(bottom);review();}},setVisible(next){if(visible===next)return;visible=next;panel.hidden=!next;if(!next){if(dialog.open)dialog.close();disconnect(false);}},dispose(){disposed=true;disconnect(false);dialog.remove();panel.remove();}};
}
