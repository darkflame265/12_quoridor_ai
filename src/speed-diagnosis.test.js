import test from 'node:test';import assert from 'node:assert/strict';
import {compareFixed,diagnoseSpeedCase} from '../evaluation/speed-diagnosis.mjs';
const result=(x,score=50,depth=3)=>({depth,score,pv:[{type:'move',x,y:4}]});
test('fixed-depth diagnosis separates tied actions, incomplete searches and score differences',()=>{
 assert.equal(compareFixed(result(1),result(2),3).tiedAlternative,true);
 assert.equal(compareFixed(result(1,50,2),result(2,80),3).comparable,false);
 assert.equal(compareFixed(result(1),result(2,80),3).scoreDiffers,true);
 const s={selective3:result(1),full3:result(2),selective4:result(1,50,4),full4:result(1,80,4),parallel3:result(1),timed4:result(1),long4:result(2)};
 const d=diagnoseSpeedCase({searches:s,threats:[{sampled:0,independentGain:2}]});assert.equal(d.selective3.scoreDiffers,false);assert.equal(d.selective4.scoreDiffers,true);assert.equal(d.coreScoreDifferences,undefined);assert.equal(d.cores3.scoreDiffers,false);assert.equal(d.threatOmissions,1);assert.equal(d.timeActionChanges,true);
});
