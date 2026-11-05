import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const comparison=read('evaluation/sigma4-cache200-original-equivalence-20261105.json');
const capacities=read('evaluation/sigma4-cache-capacity-20261105.json');
const startup=read('evaluation/sigma4-cached200-startup-20261105.json');
assert.equal(comparison.results.length,30);
for(const entry of comparison.results){
 assert.deepEqual(entry.original.pv,entry.cached.pv);
 assert.equal(entry.original.value,entry.cached.value);
 assert.equal(entry.original.diagnosticsHash,entry.cached.diagnosticsHash);
}
assert.equal(capacities.results.length,30);
assert(startup.results.length>=6);
for(const entry of capacities.results){
 assert.deepEqual(entry[2048].pv,entry[4096].pv);
 assert.deepEqual(entry[2048].pv,entry[8192].pv);
 assert.equal(entry[2048].value,entry[4096].value);
 assert.equal(entry[2048].value,entry[8192].value);
 assert.equal(entry[2048].rootChildrenHash,entry[4096].rootChildrenHash);
 assert.equal(entry[2048].rootChildrenHash,entry[8192].rootChildrenHash);
}
const c=capacities.summary;
const gainedHits=(c[4096].hits+c[8192].hits)-2*c[2048].hits;
const warm=startup.results.filter(r=>r.mode==='warm');
const cold=startup.results.filter(r=>r.mode==='cold');
const assessment={
 version:'sigma4-200-cache-promotion-audit-v1',
 evidence:{equivalentPositions:comparison.results.length,original:comparison.summary.original,cached:comparison.summary.cached,capacities:c,extraHitsFromLargerCaches:gainedHits,coldFirstMs:cold.map(r=>r.wallMs),warmFirstMs:warm.map(r=>r.wallMs)},
 gates:{
 exactSearchEquivalence:true,
 measurableCacheAcceleration:comparison.summary.cached.meanMs<comparison.summary.original.meanMs,
 largerCacheProvenBetter:gainedHits>0,
 strict500MsAllWarm:comparison.summary.cached.maxMs<=500&&warm.every(r=>r.wallMs<=500),
 strict500MsCold:cold.every(r=>r.wallMs<=500),
 independentFixtureCoverage: false,
 strengthMatchedHoldout:false
 },
 promotionApproved:false,
 recommendation:'Retain tested 2048-entry cache as research-only. Do not promote to website default or claim guaranteed 500ms. Increase independent and wall-heavy position coverage, profile pathological cache misses, and engineer hard-deadline safe fallback.'
};
assert.equal(assessment.gates.largerCacheProvenBetter,false);
assert.equal(assessment.gates.strict500MsAllWarm,false);
assert.equal(assessment.gates.strict500MsCold,false);
writeFileSync('evaluation/sigma4-cache200-promotion-audit-20261105.json',JSON.stringify(assessment,null,2)+'\n');
console.log('PASS research audit',JSON.stringify({equivalent:assessment.evidence.equivalentPositions,meanMs:{original:comparison.summary.original.meanMs,cached:comparison.summary.cached.meanMs},p95:{original:comparison.summary.original.p95Ms,cached:comparison.summary.cached.p95Ms},over500:{original:comparison.summary.original.over500,cached:comparison.summary.cached.over500},extraHits:gainedHits,approved:assessment.promotionApproved}));
