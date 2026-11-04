import {apply,clone,distance,validWall} from '../src/engine.js';
const wallCoords=[];
for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v'])wallCoords.push({type:'wall',x,y,o});
function attackerState(state,defender){
 const s={...state,turn:1-defender};
 return s;
}
export function directWallThreat(state,defender,{topK=5}={}){
 if(state.winner!==null)return {baselineDistances:[distance(state,defender),distance(state,1-defender)],candidates:[],maxOwnIncrease:0};
 const attacker=1-defender;
 const baseOwn=distance(state,defender),baseEnemy=distance(state,attacker);
 if(state.left[attacker]<=0)return {baselineDistances:[baseOwn,baseEnemy],candidates:[],maxOwnIncrease:0};
 const probe=attackerState(state,defender);
 const options=[];
 for(const w of wallCoords){
  if(!validWall(probe,w))continue;
  const next=apply(probe,w);
  const own=distance(next,defender),enemy=distance(next,attacker);
  const ownIncrease=own-baseOwn,enemyIncrease=enemy-baseEnemy;
  if(ownIncrease<=0)continue;
  options.push({action:w,ownIncrease,enemyIncrease,netDamage:ownIncrease-enemyIncrease,
    distances:[own,enemy]});
 }
 options.sort((a,b)=>b.ownIncrease-a.ownIncrease||b.netDamage-a.netDamage||
   a.action.y-b.action.y||a.action.x-b.action.x||a.action.o.localeCompare(b.action.o));
 return {baselineDistances:[baseOwn,baseEnemy],maxOwnIncrease:options[0]?.ownIncrease||0,
   maxNetDamage:Math.max(0,...options.map(x=>x.netDamage)),
   availableAttackerWalls:state.left[attacker],legalDamageWalls:options.length,
   candidates:options.slice(0,Math.max(0,topK))};
}
export function unansweredTwoWallThreat(state,defender,{topK=6,secondTopK=3}={}){
 const immediate=directWallThreat(state,defender,{topK});
 const attacker=1-defender;
 if(state.winner!==null||state.left[attacker]<2||topK<=0){
  return {...immediate,unansweredTwoWall:null};
 }
 const probe=attackerState(state,defender);
 let best=null;
 for(const first of immediate.candidates){
  const after=apply(probe,first.action);
  const second=directWallThreat(after,defender,{topK:secondTopK});
  for(const choice of second.candidates){
   const ownIncrease=choice.distances[0]-immediate.baselineDistances[0];
   const enemyIncrease=choice.distances[1]-immediate.baselineDistances[1];
   if(!best||ownIncrease>best.ownIncrease||
      (ownIncrease===best.ownIncrease&&ownIncrease-enemyIncrease>best.netDamage)){
      best={first:first.action,second:choice.action,ownIncrease,enemyIncrease,
        netDamage:ownIncrease-enemyIncrease,
        distancesAfter:[choice.distances[0],choice.distances[1]]};
   }
  }
 }
 return {...immediate,unansweredTwoWall:best,
  assumptions:'Attacker hypothetically places two walls consecutively with no defending move. Illustrative sampled risk without defensive replies; neither an exhaustive maximum nor an executable two-turn sequence.'};
}
