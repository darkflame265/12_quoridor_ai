import {SPLITS,openings,mazeOpenings} from './suite.js';
import {nativeFixtures} from './native-fixtures.mjs';
import {positionKey} from './native-diagnostics.mjs';
export const SEARCH_SEEDS={development:881931,validation:443159,holdout:755627};
export const SEARCH_COHORTS={'search55-v1':SEARCH_SEEDS,'search56-v1':{development:569321,validation:349979,holdout:926347},'search57-v1':{development:713821,validation:468793,holdout:182537},'search58-v1':{development:849193,validation:293761,holdout:637499},'search59-v1':{development:517873,validation:962431,holdout:328619},'search62-v1':{development:625817,validation:843271,holdout:196537}};
for(const [cohort,seeds] of Object.entries(SEARCH_COHORTS))for(const [split,seed] of Object.entries(seeds))SPLITS[`${cohort}-${split}`]=seed;
const pools=new Map();
export function searchFixtures(split,suite,count,cohort='search55-v1'){
 if(!(cohort in SEARCH_COHORTS)||!(split in SEARCH_COHORTS[cohort])||!['general','maze'].includes(suite)||!Number.isInteger(count)||count<1||count>50)throw Error('Invalid search fixture selection');
 const key=`${cohort}:${split}:${suite}`;
 if(!pools.has(key)){
  const used=new Set(['development','validation','holdout'].flatMap(s=>nativeFixtures(s,suite,50,'v3')).map(f=>positionKey(f.state)));
  for(const previous of Object.keys(SEARCH_COHORTS).slice(0,Object.keys(SEARCH_COHORTS).indexOf(cohort)))for(const s of ['development','validation','holdout'])for(const f of searchFixtures(s,suite,50,previous))used.add(positionKey(f.state));
  if(split!=='development')for(const f of searchFixtures('development',suite,50,cohort))used.add(positionKey(f.state));
  if(split==='holdout')for(const f of searchFixtures('validation',suite,50,cohort))used.add(positionKey(f.state));
  const generator=suite==='general'?openings:mazeOpenings,pool=[];
  const seedKey=cohort==='search55-v1'?`search55-${split}`:`${cohort}-${split}`;
  // Preserve the exact old cohort keys while giving later candidates fresh seeds.
  if(cohort==='search55-v1')SPLITS[seedKey]=SEARCH_SEEDS[split];
  for(const amount of [180,600]){
   pool.length=0;const local=new Set(used);
   for(const f of generator(seedKey,amount)){const k=positionKey(f.state);if(local.has(k))continue;local.add(k);pool.push(f);if(pool.length===50)break;}
   if(pool.length===50)break;
  }
  if(pool.length<50)throw Error('Not enough independent search layouts');pools.set(key,pool);
 }
 return pools.get(key).slice(0,count).map(f=>structuredClone(f));
}
