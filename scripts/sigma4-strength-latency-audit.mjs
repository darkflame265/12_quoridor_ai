import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const read=p=>JSON.parse(readFileSync(p,'utf8'));
const baseline=read('evaluation/sigma4-cache100-independent-paired-20261105.json');
const contender=read('evaluation/sigma4-bitset200-vs-sigma23-20261105.json');
const latency=read('evaluation/sigma4-inference-decomposition-controlled-20261105.json');
const queue=read('evaluation/sigma4-warm-serial-queue-20261105.json');
const old=baseline.games.filter(g=>g.variant==='original200'&&['sigma2','sigma3'].includes(g.opponent));
assert.equal(old.length,8);
assert.equal(contender.games.length,8);
let equalGames=0;
const comparison=[];
for(const b of contender.games){
 const a=old.find(g=>g.opponent===b.opponent&&g.fixture===b.fixture&&g.candidateSide===b.candidateSide);
 assert(a);
 assert.equal(b.hash,a.hash,'optimized full-game move sequence diverged');
 assert.equal(b.candidateWon,a.candidateWon);
 assert.equal(b.plies,a.plies);
 equalGames++;
 comparison.push({opponent:b.opponent,fixture:b.fixture,seat:b.candidateSide,won:b.candidateWon,plies:b.plies,identicalActions:true});
}
assert.equal(latency.results.length,24);
assert.equal(queue.results.length,3);
for(const mode of ['serial','concurrent']){
 assert.equal(latency.summary[mode].engineMs.n,12);
 const a=latency.results.filter(x=>x.mode===mode);
 assert(a.every(x=>x.cache.tensorBuilds===x.cache.misses));
}
const performanceSources=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma4-statekey-timing-worker.py','scripts/sigma4-warm-serial-pool.mjs'];
const hashes=Object.fromEntries(performanceSources.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const opponents={};
for(const name of ['sigma2','sigma3']){
 const games=comparison.filter(g=>g.opponent===name);
 opponents[name]={wins:games.filter(g=>g.won).length,losses:games.filter(g=>!g.won).length,games:games.length};
}
const audit={
 version:'sigma4-speed-versus-strength-audit-v1',
 optimized200VsNative:opponents,
 identicalToOriginalWeighted200:{fullGames:equalGames,allActionsMatched:true,sameWins:true},
 performance:{
 singleWorker:latency.summary.serial,
 twoWorkersAtOnce:latency.summary.concurrent,
 warmQueue:queue,
 notes:'Concurrency samples used fresh prewarmed workers for each mode. The serial mode always ran first, and the measured ONNX/Python timings include profiling overhead. This is exploratory, not a controlled load-neutral latency guarantee.'
 },
 promotionGates:{
 fasterInSomeBenchmarks:true,
 searchDecisionsPreserved:true,
 outperformSigma2Proven:false,
 outperformSigma3Proven:false,
 strict500msProven:false,
 productionPromotionApproved:false
 },
 codeHashes:hashes
};
writeFileSync('evaluation/sigma4-optimized-vs-sigma23-latency-audit-20261105.json',JSON.stringify(audit,null,2)+'\n');
console.log('PASS audit',JSON.stringify({opponents,identicalFullGames:equalGames,soloMean:latency.summary.serial.engineMs.mean,concurrentMean:latency.summary.concurrent.engineMs.mean,promotionApproved:false}));
