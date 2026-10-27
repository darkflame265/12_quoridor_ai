import test from 'node:test';
import assert from 'node:assert/strict';
import {assessNative} from '../evaluation/native-policy.mjs';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
function report(split,pairs){const games=[];for(const suite of ['general','maze'])for(let openingIndex=0;openingIndex<pairs;openingIndex++)for(const candidateSide of [0,1])games.push({suite,openingIndex,candidateSide,result:candidateSide===0?'win':openingIndex===0?'win':'loss',replayValidated:true});return {status:'completed',split,pairsPerSuite:pairs,fixtureSeed:split==='validation'?1:2,sourceHash:'frozen',candidate:'candidate',baseline:'baseline',ms:500,cores:4,games,tactics:Array.from({length:16},()=>({pass:true})),timing:{candidate:{moves:100,overruns:0}}};}
test('native release gate requires paired validation and untouched holdout',()=>{
 const a=report('validation',3),b=report('holdout',4);assert.equal(assessNative(a,b,'frozen').eligible,true);
 b.games[0].candidateSide=1;assert.equal(assessNative(a,b,'frozen').eligible,false);
});
test('native release rejects losing mazes, altered code, overruns and partial reports',()=>{
 const fresh=()=>[report('validation',3),report('holdout',4)];let [a,b]=fresh();for(const g of b.games)if(g.suite==='maze')g.result='loss';assert.equal(assessNative(a,b,'frozen').checks.suiteNoRegression,false);
 [a,b]=fresh();assert.equal(assessNative(a,b,'changed').eligible,false);
 [a,b]=fresh();b.timing.candidate.overruns=5;assert.equal(assessNative(a,b,'frozen').eligible,false);
 [a,b]=fresh();b.status='running';assert.equal(assessNative(a,b,'frozen').eligible,false);
 [a,b]=fresh();b.tactics[0].pass=false;assert.equal(assessNative(a,b,'frozen').eligible,false);
});
test('native holdout excludes the shared standard opening and validation layouts',()=>{
 for(const suite of ['general','maze']){const validation=nativeFixtures('validation',suite,3),holdout=nativeFixtures('holdout',suite,4),signatures=new Set(validation.map(f=>JSON.stringify(f.state)));assert.equal(holdout.length,4);for(const f of holdout){assert.ok(f.records.length>0);assert.ok(!signatures.has(JSON.stringify(f.state)));}}
});
test('new evaluation cohort excludes previously used holdout positions',()=>{
 for(const suite of ['general','maze']){const old=new Set([...nativeFixtures('holdout',suite,4,'v1'),...nativeFixtures('validation',suite,3,'v2')].map(f=>JSON.stringify(f.state)));for(const f of nativeFixtures('holdout',suite,4,'v2'))assert.ok(!old.has(JSON.stringify(f.state)));}
 const a=report('validation',3),b=report('holdout',4);a.cohort='v1';b.cohort='v2';assert.equal(assessNative(a,b,'frozen').eligible,false);
});
