# SIGMA4 200-sim optimized engine: strength versus SIGMA2/3, and runtime contention
Date: 2026-11-05. Status: research only; production default unchanged.

## What the optimization does, and does not do
The research SIGMA4 combines a 200-simulation Sigma3-based MCTS, the original weighted stochastic root selection, an in-process ONNX LRU, and bitset wall-path legality. A separate state-key experiment avoids tensor construction for cache hits. These changes target runtime overhead, not stronger search, a different neural model, or a provably better move-selection policy.

The research engines are NOT synonymous with the live website's SIGMA4 selector. Faster calculation at a fixed 200-simulation budget does not by itself imply higher win rate against Sigma2, Sigma3, or the current production default.

## Paired direct duels (8 full games)
Same two previously evaluated six-ply starting fixtures, both seats; natural opponent policies:
- Optimized weighted SIGMA4 versus native Sigma2: **3 wins, 1 loss**.
- Optimized weighted SIGMA4 versus native Sigma3: **2 wins, 2 losses**.
- Combined: **5 wins, 3 losses**, 8 completed games, no 200-ply cutoff.

Each of the eight full-game move lists and final win/loss results matched the prior unoptimized 200-simulation weighted SIGMA4 on the exact same fixture, seat, seed and opponent conditions. This is a strong limited-sample non-regression result and specifically **not proof of better AI strength**. SIGMA3 was a draw in this small match; SIGMA2 loss probability cannot be inferred from 4 games.

The comparison includes repeated experimental fixtures and stochastic policy sampling and is not a blind, large-sample, independent tournament. No claims of guaranteed wins or globally best engine are justified.

## Controlled decomposition of slow search decisions
The research-only profiler times ONNX execution, tensor creation, cache key evaluation, and remaining Python/MCTS work. Twelve recorded positions were run with (a) sequential execution and (b) simultaneous execution on two independent, newly prewarmed workers. New workers per mode ensure neither mode inherits the other's inference cache.

| Metric | Sequential mode, mean | Simultaneous mode, mean |
|---|---:|---:|
| Profiled engine total | **571.7ms** | **686.6ms** |
| ONNX run cumulative | 322.4ms | 396.3ms |
| Tensor creation | 10.8ms | 11.0ms |
| Python/MCTS outside inference wrapper | 236.4ms | 276.6ms |
| Profiled engine p95 | 868.4ms | 1135.7ms |

Concurrency increased measured total latency by about 20% on this machine and workload, with the ONNX inference run being a large contributor. The sequence of modes was not randomized (sequential first), samples are correlated and the profiling overhead is nonzero. These are diagnostic metrics, not an independent p95/p99 reliability proof, nor a guarantee across hardware.

A preliminary comparison re-used already warmed caches between modes and misleadingly showed zero cache misses under concurrency; it is superseded by the freshly prewarmed, independent-worker measurements above.

## Research-only prewarmed serialized process
Added a minimal SigmaWarmSerialPool around the existing isolated SigmaProcess. It:
- Preloads the model/worker once.
- Runs work requests serially on one persistent worker.
- Reports individual queue wait, search wall time and full response time.
- Keeps failures isolated to the requesting Promise, lets the queue continue, and prevents new requests after closing.

Three simultaneous requests of the same initial position, using 200-simulation bitset search, demonstrated:
- Startup prewarm: 555.3ms.
- Search computation: 636.2, 261.1, 246.8ms.
- Total elapsed per queued request: 636.3, 897.5, 1144.3ms.

Serial scheduling avoids multiple simultaneous searches within that worker but **does not satisfy a 500ms deadline**; queue waiting can make the time-to-answer much worse. Therefore this wrapper is not enabled in the live website. It currently does not cancel a running search or synthesize a fallback move.

## Files
- scripts/sigma4-statekey-timing-worker.py ºw^~)Þt separate profiling copy, no production mutation.
- scripts/sigma4-inference-decomposition.mjs ºw^~)Þt preliminary profiling, *not comparable across modes* due to cache reuse.
- scripts/sigma4-inference-decomposition-controlled.mjs  corrected independent-warm-worker profiling.
- scripts/sigma4-bitset200-vs-sigma23.mjs  resumable 8 full-game matched duels.
- scripts/sigma4-warm-serial-pool.mjs and scripts/test_sigma4_warm_serial_pool.mjs ºw^~)Þt research queue.
- scripts/sigma4-strength-latency-audit.mjs  machine-verifiable matched game hashes and no-promotion verdict.
- evaluation/sigma4-inference-decomposition-controlled-20261105.json
- evaluation/sigma4-bitset200-vs-sigma23-20261105.json
- evaluation/sigma4-warm-serial-queue-20261105.json
- evaluation/sigma4-optimized-vs-sigma23-latency-audit-20261105.json

## Decision and future work
**Do not promote this candidate above SIGMA2/3 or replace the live default.** It preserves original SIGMA4 gameplay on the eight tested matches and can run faster on some positions. The remaining challenge is ONNX CPU inference cost and load sensitivity, not root move quality. A fair blind, large-set cross-engine tournament (both seats, many independent wall-heavy and endgame positions), several hundred individual searches with random benchmark order, warm and cold load tests, and safe deadline handling must precede promotion. Strength improvements, if desired, must come from stronger evaluation, better tactical search, and independent regression tests rather than caching alone.
