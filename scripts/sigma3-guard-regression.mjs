import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,legal} from '../src/engine.js';
const positions=JSON.parse(readFileSync('evaluation/sigma3-changed-positions-211.json','utf8'));
const expected={0:{sigma2:{type:'move',x:5,y:5},sigma3:{type:'wall',x:7,y:1,o:'v'}},46:{sigma2:{type:'move',x:5,y:2},sigma3:{type:'move',x:5,y:2}}};
process.env.SIGMA_EXPLORATION='0';process.env.SIGMA_DIAGNOSTICS='1';
const report=[];
for(const p of positions)for(const variant of ['sigma2','sigma3']){
 const engine=new SigmaProcess({variant});
 try{const result=await engine.search({...clone(p.s),historyStates:p.history});const got=result.pv?.[0];assert.deepEqual(got,expected[p.index][variant]);assert(legal(p.s,got)); const item={index:p.index,variant,got,elapsedMs:result.elapsedMs,corridor:result.diagnostics?.loopDebug?.sigma3Corridor??null};report.push(item);console.log('PASS',JSON.stringify(item))}
 finally{await engine.close()}
}
writeFileSync('evaluation/sigma3-guard-regression-211.json',JSON.stringify(report,null,2));
