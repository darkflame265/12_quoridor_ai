import {apply,distance,legal,moves} from '../src/engine.js';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';
/**
 * Research-only midgame path-risk gate. Preserve one-ply tactical safety.
 * Do not replace a safe sampled action by a native move that loses at once.
 */
export function chooseWeightedMidgameV4(state,search,rng,options={}){
 const result=chooseWeightedTacticalV3(state,search,rng,options);
 const native=search?.pv?.[0];
 if(!result.changed||!native||!legal(state,native)||
   result.reason!=='visit-and-q-weighted')return result;
 const own=state.turn,enemy=1-own;
 const beforeOwn=distance(state,own),beforeEnemy=distance(state,enemy);
 if(beforeOwn<3||beforeEnemy<3||beforeOwn>8||beforeEnemy>8)return result;
 const nativeNext=apply(state,native),candidateNext=apply(state,result.action);
 if(nativeNext.winner===null&&moves(nativeNext).some(a=>apply(nativeNext,a).winner===enemy))return result;
 const nativeOwn=distance(nativeNext,own),candidateOwn=distance(candidateNext,own);
 const nativeEnemy=distance(nativeNext,enemy),candidateEnemy=distance(candidateNext,enemy);
 const enemyAdvantage=nativeEnemy-candidateEnemy;
 const ownDisadvantage=candidateOwn-nativeOwn;
 if((enemyAdvantage>=2&&ownDisadvantage>=0)||
    (enemyAdvantage>=1&&ownDisadvantage>=2))
   return {action:native,changed:false,reason:'midgame-path-risk-gate',
      rejected:result.action,enemyAdvantage,ownDisadvantage};
 return result;
}
