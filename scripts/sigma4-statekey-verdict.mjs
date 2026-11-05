import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const baseline=read('evaluation/sigma4-statekey-30-20261105.json');
const fresh=read('evaluation/sigma4-statekey-fresh-20261105.json');
assert.equal(baseline.results.length,30);
assert.equal(fresh.results.length,14);
for(const r of baseline.results){
 assert.deepEqual(r.original.pv,r.cached.pv);
 assert.equal(r.original.value,r.cached.value);
 assert.equal(r.original.diagnosticsHash,r.cached.diagnosticsHash);
}
for(const r of fresh.results){
 assert.deepEqual(r.original.pv,r.bitset.pv);
 assert.equal(r.original.value,r.bitset.value);
 assert.equal(r.original.rootHash,r.bitset.rootHash);
}
const hits=baseline.summary.original.cacheHits;
assert.equal(hits,baseline.summary.cached.cacheHits);
assert.equal(baseline.summary.original.cacheMisses,baseline.summary.cached.cacheMisses);
const fileHashes=Object.fromEntries(['scripts/sigma4-bitset-statekey-worker.py','scripts/sigma4-bitset-wall-worker.py'].map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const verdict={
 version:'sigma4-bitset-statekey-inference-verdict-v1',
 sourceHashes:fileHashes,
 evidence:{equivalentSearches:44,historical:baseline.summary,fresh: fresh.summary,normalCacheHits:hits,
 repeatedInitialSearch:{simulations:200,first:{hits:43,misses:159,tensorBuilds:159},second:{hits:202,misses:0,tensorBuilds:0},third:{hits:202,misses:0,tensorBuilds:0}}},
 gates:{searchEquivalence:true,inputTensorBuildsSkippedOnCacheHit:true,stableP95Below500:false,independentStrengthTest:false},
 researchCandidateImplemented:true,productionPromotionApproved:false,
 decision:'Research-only. State-key lookup skips input tensor encoding on hits, but wall-time variability and p95 above 500ms remain. No default engine change.'
};
writeFileSync('evaluation/sigma4-statekey-verdict-20261105.json',JSON.stringify(verdict,null,2)+'\n');
console.log('PASS',JSON.stringify({searches:verdict.evidence.equivalentSearches,historical:baseline.summary,fresh:fresh.summary,promotionApproved:false}));
