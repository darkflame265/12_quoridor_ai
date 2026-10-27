import {openings,mazeOpenings} from './suite.js';
const freshPools=new Map();
const positionKey=s=>JSON.stringify([s.p,s.left,s.turn,s.walls.map(w=>[w.x,w.y,w.o]).sort()]);
export function nativeFixtures(split,suite,count,cohort='v1'){
 if(!['v1','v2','v3'].includes(cohort))throw Error('Unknown fixture cohort');
 const seed=cohort==='v3'?`native53-${split}`:cohort==='v2'?`native52-${split}`:split==='development'?split:`native-${split}`,generator=suite==='maze'?mazeOpenings:openings;
 if(cohort==='v3'&&split==='holdout'){
  if(!freshPools.has(suite)){const used=new Set(['v1','v2'].flatMap(c=>[...nativeFixtures('validation',suite,3,c),...nativeFixtures('holdout',suite,4,c)]).concat(nativeFixtures('validation',suite,50,'v3')).map(f=>positionKey(f.state))),pool=[];
   for(const f of generator(seed,200)){const key=positionKey(f.state);if(used.has(key))continue;used.add(key);pool.push(f);}freshPools.set(suite,pool);
  }
  const pool=freshPools.get(suite);if(pool.length<count)throw Error('Not enough distinct holdout fixtures');return pool.slice(0,count);
 }
 // The standard board is useful in validation but is not an unseen holdout.
 return split==='holdout'&&suite==='general'?generator(seed,count+1).slice(1):generator(seed,count);
}
