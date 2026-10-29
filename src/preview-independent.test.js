import test from 'node:test';
import assert from 'node:assert/strict';
import {assessIndependent,geometryKey,archiveGeometries,study} from '../evaluation/preview-independent.mjs';
import {initial} from './engine.js';
import {rotate} from '../evaluation/suite.js';
function evidence(){return ['general','maze'].flatMap(suite=>[0,1,2].flatMap(f=>[false,true].map(flipped=>({id:`${suite}-${f}-${flipped}`,suite,familyId:`${suite}-${f}`,flipped,integrity:true,fixed3Parity:true,deepRequired:f===0,fixedGaps:{4:{off:10,pressure:0},5:{off:10,pressure:0}},budgetGaps:Object.fromEntries(study.budgets.map(n=>[n,{off:10,pressure:0}])),budgets:Object.fromEntries(study.budgets.map(n=>[n,{off:{result:{depth:4,score:0}},pressure:{result:{depth:4,score:0}}}])),timed:[0,1,2].flatMap(round=>['original','pressure'].map(role=>({round,role,gap:role==='pressure'?0:10,result:{depth:4,elapsedMs:500}})))}))));}
test('independent study requires distinct geometric families, not two orientations of one success',()=>{
 const rows=evidence();assert.equal(assessIndependent(rows).eligibleForArena,true);
 for(const r of rows)if(r.familyId!=='general-0')r.fixedGaps[4].pressure=10;
 assert.equal(assessIndependent(rows).checks.fixed4ImprovesDifferentFamilies,false);assert.equal(assessIndependent(rows).eligibleForArena,false);
});
test('missing deep reference or pair prevents an independent pass',()=>{
 const rows=evidence();delete rows[0].fixedGaps[5];assert.equal(assessIndependent(rows).eligibleForArena,false);assert.equal(assessIndependent(evidence().slice(1)).checks.complete,false);
});
test('a suite regression cannot be hidden by improvement in the other suite',()=>{
 const rows=evidence();for(const r of rows.filter(r=>r.suite==='general'))r.fixedGaps[4].pressure=20;
 assert.equal(assessIndependent(rows).checks.fixed4SuiteNoRegression,false);assert.equal(assessIndependent(rows).eligibleForArena,false);
});
test('repeated same-orientation rows do not replace missing paired cases',()=>{
 const rows=evidence();rows[1].flipped=false;assert.equal(assessIndependent(rows).checks.complete,false);
});
test('archive geometry exclusion ignores owner, pawn location and geometric symmetries',()=>{
 const s=initial();s.walls=[{type:'wall',x:1,y:2,o:'h',owner:0},{type:'wall',x:4,y:3,o:'v',owner:1}];assert.equal(geometryKey(s),geometryKey(rotate(s)));
 const old=new Set();archiveGeometries({records:s.walls},old);assert.ok(old.has(geometryKey(s)));assert.ok(old.has(''));const changed=structuredClone(s);changed.p[0].x=0;changed.walls[0].owner=1;assert.equal(geometryKey(s),geometryKey(changed));
});
