import {SPLITS,openings,mazeOpenings} from './suite.js';
import {nativeFixtures} from './native-fixtures.mjs';
import {positionKey} from './native-diagnostics.mjs';
export const SEARCH_SEEDS={development:881931,validation:443159,holdout:755627};
export const SEARCH_COHORTS={'search55-v1':SEARCH_SEEDS,'search56-v1':{development:569321,validation:349979,holdout:926347}};
for(const [cohort,seeds] of Object.entries(SEARCH_COHORTS))for(const [split,seed] of Object.entries(seeds))SPLITS[`${cohort}-${split}`]=seed;
const pools=new Map();
export function searchFixtures(split,suite,count,cohort='search55-v1'){
 if(!(cohort in SEARCH_COHORTS)||!(split in SEARCH_COHORTS[cohort])||!['general','maze'].includes(suite)||!Number.isInteger(count)||count<1||count>50)throw Error('Invalid search fixture selection');
 const key=`${cohort}:${split}:${suite}`;
 if(!pools.has(key)){
  const used=new Set(['development','validation','holdout'].flatMap(s=>nativeFixtures(s,suite,50,'v3')).map(f=>positionKey(f.state)));
  if(cohort==='search56-v1')for(const s of ['development','validation','holdout'])for(const f of searchFixtures(s,suite,50,'search55-v1'))used.add(positionKey(f.state));
  if(split!=='development')for(const f of searchFixtures('development',suite,50,cohort))used.add(positionKey(f.state));
  if(split==='holdout')for(const f of searchFixtures('validation',suite,50,cohort))used.add(positionKey(f.state));
  const generator=suite==='general'?openings:mazeOpenings,pool=[];
  const seedKey=cohort==='search55-v1'?`search55-${split}`:`${cohort}-${split}`;
  // Preserve the exact old cohort keys while giving later candidates fresh seeds.
  if(cohort==='search55-v1')SPLITS[seedKey]=SEARCH_SEEDS[split];
  for(const f of generator(seedKey,600)){const k=positionKey(f.state);if(used.has(k))continue;used.add(k);pool.push(f);if(pool.length===50)break;}
  if(pool.length<50)throw Error('Not enough independent search layouts');pools.set(key,pool);
 }
 return pools.get(key).slice(0,count).map(f=>structuredClone(f));
}
