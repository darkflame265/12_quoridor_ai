import {SPLITS,openings,mazeOpenings} from './suite.js';
import {nativeFixtures} from './native-fixtures.mjs';
import {positionKey} from './native-diagnostics.mjs';
export const SEARCH_SEEDS={development:881931,validation:443159,holdout:755627};
for(const [split,seed] of Object.entries(SEARCH_SEEDS))SPLITS[`search55-${split}`]=seed;
const pools=new Map();
export function searchFixtures(split,suite,count){
 if(!(split in SEARCH_SEEDS)||!['general','maze'].includes(suite)||!Number.isInteger(count)||count<1||count>50)throw Error('Invalid search fixture selection');
 const key=`${split}:${suite}`;
 if(!pools.has(key)){
  const used=new Set(['development','validation','holdout'].flatMap(s=>nativeFixtures(s,suite,50,'v3')).map(f=>positionKey(f.state)));
  if(split!=='development')for(const f of searchFixtures('development',suite,50))used.add(positionKey(f.state));
  if(split==='holdout')for(const f of searchFixtures('validation',suite,50))used.add(positionKey(f.state));
  const generator=suite==='general'?openings:mazeOpenings,pool=[];
  for(const f of generator(`search55-${split}`,300)){const k=positionKey(f.state);if(used.has(k))continue;used.add(k);pool.push(f);if(pool.length===50)break;}
  if(pool.length<50)throw Error('Not enough independent search layouts');pools.set(key,pool);
 }
 return pools.get(key).slice(0,count).map(f=>structuredClone(f));
}
