import {openings,mazeOpenings} from './suite.js';
export function nativeFixtures(split,suite,count,cohort='v1'){
 if(!['v1','v2'].includes(cohort))throw Error('Unknown fixture cohort');
 const seed=cohort==='v2'?`native52-${split}`:split==='development'?split:`native-${split}`,generator=suite==='maze'?mazeOpenings:openings;
 // The standard board is useful in validation but is not an unseen holdout.
 return split==='holdout'&&suite==='general'?generator(seed,count+1).slice(1):generator(seed,count);
}
