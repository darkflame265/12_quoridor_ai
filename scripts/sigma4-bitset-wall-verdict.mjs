import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const load=p=>JSON.parse(readFileSync(p,'utf8'));
const old=load('evaluation/sigma4-bitset-wall-30-20261105.json');
const late=load('evaluation/sigma4-bitset-wall-lategame-20261105.json');
const fresh=load('evaluation/sigma4-bitset-fresh-wallheavy-20261105.json');
const walls9=load('evaluation/sigma4-bitset-wall-legality-9x9-20261105.json');
const walls7=load('evaluation/sigma4-bitset-wall-legality-7x7-20261105.json');
assert.equal(old.results.length,30);
assert.equal(late.results.length,13);
assert.equal(fresh.results.length,14);
assert(walls9.allMatched&&walls7.allMatched);
for(const row of old.results){
 assert.deepEqual(row.original.pv,row.cached.pv);
 assert.equal(row.original.value,row.cached.value);
 assert.equal(row.original.diagnosticsHash,row.cached.diagnosticsHash);
}
for(const row of fresh.results){
 assert.deepEqual(row.original.pv,row.bitset.pv);
 assert.equal(row.original.value,row.bitset.value);
 assert.equal(row.original.rootHash,row.bitset.rootHash);
}
const files=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma4-cache-worker.py','scripts/sigma4-budget-process.mjs'];
const fileHashes=Object.fromEntries(files.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const report={
 version:'sigma4-bitset-wall-promotion-verdict-v1',
 files:fileHashes,
 accuracy:{legalWalls9x9:walls9.states,legalWalls7x7:walls7.states,wallHeavyStates9x9:walls9.statesWith10PlusWalls,rootComparisons:57,originalHistorical:30,middleLate:13,freshWallHeavy:14,allMatched:true},
 benchmark:{
 directWall9x9:walls9,
 directWall7x7:walls7,
 historical:{baseline:old.summary.original,bitset:old.summary.cached},
 freshWallHeavy:{baseline:fresh.summary.original,bitset:fresh.summary.bitset},
 middleLate:{bitset:late.summary}
 },
 gates:{
 legalListsMatched:true,
 searchDecisionsMatched:true,
 meanSpeedImprovedOnBothSets:old.summary.cached.meanMs<old.summary.original.meanMs&&fresh.summary.bitset.meanMs<fresh.summary.original.meanMs,
 p95Below500BothSets:old.summary.cached.p95Ms<500&&fresh.summary.bitset.p95Ms<500,
 freshFullGameWinRateProven:false,
 strict500MsProven:false
 },
 researchCandidateAccepted:true,
 productionPromotionApproved:false,
 rationale:'Bitset graph reachability reduces wall-generation cost and preserves sampled decisions. P95 latency still over 500ms; the default remains unchanged.'
};
assert(report.gates.meanSpeedImprovedOnBothSets);
assert.equal(report.gates.p95Below500BothSets,false);
writeFileSync('evaluation/sigma4-bitset-wall-verdict-20261105.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS',JSON.stringify({accuracy:report.accuracy,historicalMs:[old.summary.original.meanMs,old.summary.cached.meanMs],freshMs:[fresh.summary.original.meanMs,fresh.summary.bitset.meanMs],productionPromotionApproved:report.productionPromotionApproved}));
