import {apply} from '../game/engine.js';
import {inferScreenMoves,recoverScreenSequence} from './screen-sync.js';

// Board facts and slowly repainted turn/counter UI are separate evidence.
// Only a unique legal observed transition may advance the board; no predicted
// or invisible action is added to make the source captions fit.
export function reconcileScreenFrame(before,target,frames=[],{
 sourceTurn,sourceCount=null,logicalCount=null,confirmedCount=null,
 turnConflict=false,autoTurn=true
}={}){
 const numeric=Number.isInteger(sourceCount)&&sourceCount>=0;
 const delta=numeric&&logicalCount!==null?sourceCount-logicalCount:undefined;
 if(numeric&&confirmedCount!==null&&sourceCount<confirmedCount)throw Error('원본 수 번호가 이전에 확인한 수보다 작아졌습니다. 되돌리기·새 게임은 재동기화하세요.');
 if(delta!==undefined&&(delta>6||delta< -6))throw Error('원본 수 번호가 추적 범위를 벗어났습니다. 현재 화면을 재동기화하세요.');
 let actions,fast=true;
 try{actions=inferScreenMoves(before,target);}catch{fast=false;}
 if(!fast){
  actions=recoverScreenSequence(before,target,frames,{
   expectedTurn:sourceTurn,
   expectedPlies:delta!==undefined&&delta>0?delta:undefined
  });
 }
 // A counter ahead of the geometry is a transitional/incorrect frame. A
 // lagging counter, however, must not hide a fully observed legal move.
 if(delta!==undefined&&delta>actions.length)throw Error('기보 숫자가 보드보다 먼저 바뀌었습니다. 다음 프레임의 배치를 확인합니다.');
 let next=before;for(const action of actions)next=apply(next,action);
 const turnAgrees=sourceTurn!==undefined&&sourceTurn===next.turn;
 const countAgrees=delta!==undefined&&delta===actions.length;
 const ready=!autoTurn||next.winner!==null||!turnConflict&&(turnAgrees||countAgrees&&sourceTurn===undefined);
 const nextLogical=logicalCount!==null?logicalCount+actions.length:numeric&&ready?sourceCount:null;
 const nextConfirmed=numeric&&nextLogical===sourceCount?sourceCount:confirmedCount;
 const immediate=actions.length>0&&ready&&(delta===undefined||countAgrees);
 return {actions,next,ready,immediate,logicalCount:nextLogical,confirmedCount:nextConfirmed};
}
