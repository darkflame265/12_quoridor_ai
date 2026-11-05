import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const prev=load('evaluation/sigma4-cache200-original-equivalence-20261105.json');
const late=load('evaluation/sigma4-cache200-lategame-equivalence-20261105.json');
const wall=load('evaluation/sigma4-cache200-wall-actions-screen-20261105.json');
const terminal=load('evaluation/sigma4-cache200-fastterminal-20261105.json');
const position=load('evaluation/sigma4-cache200-positionkey-20261105.json');
const conditions=[wall,terminal,position];
assert.equal(prev.results.length,30);assert.equal(late.results.length,13);
for(const x of conditions){
 assert.equal(x.results.length,30);
 for(const y of x.results){
  assert.deepEqual(y.original.pv,y.cached.pv);
  assert.equal(y.original.value,y.cached.value);
  assert.equal(y.original.diagnosticsHash,y.cached.diagnosticsHash);
 }
}
const verdict={
 version:'sigma4-cache200-microoptimization-verdict-v1',
 validatedEquivalence:{originalVsCached:prev.results.length,lateAdditional:late.results.length,total:prev.results.length+late.results.length,threeMicroCandidates:conditions.map(x=>x.results.length)},
 experiments:{
 wallActionMemo:{baselineMeanMs:wall.summary.original.meanMs,candidateMeanMs:wall.summary.cached.meanMs,baselineP95:wall.summary.original.p95Ms,candidateP95:wall.summary.cached.p95Ms,approved:false},
 fastTerminal:{baselineMeanMs:terminal.summary.original.meanMs,candidateMeanMs:terminal.summary.cached.meanMs,baselineP95:terminal.summary.original.p95Ms,candidateP95:terminal.summary.cached.p95Ms,approved:false},
 positionKeyMemo:{baselineMeanMs:position.summary.original.meanMs,candidateMeanMs:position.summary.cached.meanMs,baselineP95:position.summary.original.p95Ms,candidateP95:position.summary.cached.p95Ms,approved:false}
 },
 readiness:{productionDefaultChanged:false,strict500msProven:false,promotionApproved:false},
 decision:'Retain existing 200-simulation 2048-entry ONNX cache as research-only. All three new micro-optimizations failed the latency-tail gate.'
};
for(const x of Object.values(verdict.experiments))assert(x.candidateP95>x.baselineP95);
writeFileSync('evaluation/sigma4-cache200-hotspot-verdict-20261105.json',JSON.stringify(verdict,null,2)+'\n');
console.log('PASS',JSON.stringify(verdict));
