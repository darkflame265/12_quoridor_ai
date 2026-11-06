import {apply,legal,validWall,distance,moves,notation} from '../game/engine.js';

const wallName=a=>`${notation(a).slice(0,-1)} ${a.o==='h'?'가로벽':'세로벽'}`;
const wallAt=(s,a,side)=>({...s,turn:side,walls:[...s.walls,a]});
const opponentView=(s,side)=>({...s,turn:side});

// Describe measured effects, not an invented account of the engine's intent.
// Static route lengths ignore future walls and pawn jumping; never call them
// guaranteed arrival turns. Expensive comparisons run only in a Web Worker.
export function recommendationReason(s,action,{review=false,budgetMs=35,now=()=>performance.now()}={}){
 if(!action||!legal(s,action))return null;
 const me=s.turn,enemy=1-me,next=apply(s,action);
 const ownBefore=distance(s,me),ownAfter=distance(next,me);
 const enemyBefore=distance(s,enemy),enemyAfter=distance(next,enemy);
 const ownChange=ownAfter-ownBefore,enemyDelay=enemyAfter-enemyBefore;
 const optionsBefore=moves(s,enemy).length,optionsAfter=moves(next,enemy).length;
 const effects={ownBefore,ownAfter,enemyBefore,enemyAfter,ownChange,enemyDelay,optionsBefore,optionsAfter};
 let kind='move',summary;
 if(next.winner===me){kind='win';summary='이동하면 목표 줄에 도착해 바로 승리합니다.';}
 else if(action.type==='wall'){
  kind='wall';
  summary=enemyDelay>0?`상대의 최단 경로를 ${enemyDelay}칸 늘리는 벽입니다.`:
   optionsAfter<optionsBefore?`상대가 바로 이동할 수 있는 칸을 ${optionsBefore}곳에서 ${optionsAfter}곳으로 줄입니다.`:
   '현재 배치에서는 상대의 최단 경로를 늘리지 않는 벽입니다.';
  if(ownChange>0)summary+=` 나도 ${ownChange}칸 더 돌아가야 합니다.`;
 }else if(ownChange<0)summary=`목표까지 남은 최단 경로를 ${-ownChange}칸 줄이는 전진입니다.`;
 else if(ownChange>0){kind='retreat';summary=`목표까지 남은 경로가 ${ownChange}칸 늘어나는 이동입니다. 방어 효과는 아직 확인되지 않았습니다.`;}
 else summary=`말을 옮겨도 남은 최단 경로는 ${ownAfter}칸으로 같습니다.`;
 const details=[`현재 벽 배치 기준: 내 최단 경로 ${ownBefore}→${ownAfter}칸, 상대 ${enemyBefore}→${enemyAfter}칸. 말 점프·앞으로 놓일 벽을 포함한 도착 턴 수는 아닙니다.`];
 if(next.winner===me)return {kind,summary,details,effects};
 const immediateLoss=moves(next,enemy).some(a=>apply(next,a).winner===enemy);
 if(immediateLoss){kind='warning';summary='주의: 이 수를 두면 상대가 다음 이동으로 바로 도착할 수 있습니다.';details.unshift('추천의 안전성을 보장할 수 없는 배치입니다.');}
 if(!review)return {kind,summary,details,effects};

 const deadline=now()+budgetMs;
 let defense=null,complete=true,checked=0,attackWalls=0,bestDelay=0;
 outer:for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  if(now()>=deadline){complete=false;break outer;}
  const wall={type:'wall',x,y,o};checked++;
  // A candidate attack on our route must be legal for the opponent.
  if(s.left[enemy]>0&&validWall(opponentView(s,enemy),wall)){
   const beforeHarm=distance(wallAt(s,wall,enemy),me)-ownBefore;
   if(beforeHarm>=2){
    const stillLegal=validWall(opponentView(next,enemy),wall);
    const afterHarm=stillLegal?distance(wallAt(next,wall,enemy),me)-ownAfter:0;
    // Placing the damaging wall ourselves is not a defensive achievement.
    // Account for any detour already paid by our chosen action.
    const avoided=beforeHarm-afterHarm-Math.max(0,ownChange);
    if(avoided>=2&&(!defense||avoided>defense.avoided))defense={wall,beforeHarm,afterHarm,avoided,stillLegal};
   }
  }
  if(action.type==='move'&&s.left[me]>0&&validWall(s,wall)){
   attackWalls++;bestDelay=Math.max(bestDelay,distance(wallAt(s,wall,me),enemy)-enemyBefore);
  }
 }
 if(defense){
  const name=wallName(defense.wall);
  // A specific verified counterfactual is an effect, not a claimed search line.
  const sentence=defense.stillLegal?`상대의 ${name}에 의한 우회를 ${defense.beforeHarm}칸에서 ${defense.afterHarm}칸으로 줄입니다.`:
   `상대의 ${name} 설치를 막아, 그 벽으로 인한 ${defense.beforeHarm}칸 우회를 피합니다.`;
  details.push(sentence,'현재 배치와 이 수를 둔 배치에서 같은 상대 벽을 비교한 결과입니다. 상대가 실제로 그 벽을 선택한다는 뜻은 아닙니다.');
  if(!immediateLoss){
   kind=enemyDelay>0?'attack-defense':'defense';
   summary=enemyDelay>0?`상대 경로를 ${enemyDelay}칸 늘리고, ${name} 공격의 피해도 줄이는 공방의 수입니다.`:sentence;
   if(ownChange>0)summary+=` 대신 내 경로는 ${ownChange}칸 늘어납니다.`;
  }
 }else if(!immediateLoss&&action.type==='move'&&ownChange<0&&complete&&s.left[me]>0){
  if(bestDelay===0)summary=`상대 경로를 늘리는 합법 벽이 없어, 벽을 아끼며 ${-ownChange}칸 전진합니다.`;
  else if(bestDelay<=1)summary=`지금 벽으로 늘릴 수 있는 상대 경로는 최대 ${bestDelay}칸입니다. 벽을 아끼며 ${-ownChange}칸 전진합니다.`;
 }
 if(action.type==='move'&&s.left[me]>0)details.push(complete?`합법 벽 ${attackWalls}개를 비교했을 때 상대 최단 경로 증가의 최댓값은 ${bestDelay}칸입니다. 방어벽의 가치까지 전부 비교한 결론은 아닙니다.`:'설명용 벽 비교는 시간 안에 확인한 후보만 포함합니다.');
 return {kind,summary,details,effects,defense,comparison:{complete,checked,attackWalls,bestDelay}};
}
