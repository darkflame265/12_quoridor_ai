# SIGMA4 ºw^~)Þt 200-simulation ONNX cache: long-tail and capacity study
Date: 2026-11-05

## Decision
**Keep the 2,048-entry inference cache as a research-only optimization. Do not switch the live web SIGMA4 or default engine.** The original search's policy and 200 simulations were preserved. The research cache reproduces exact root decisions on tested states and lowers latency, but does not reliably achieve the 500ms deadline.

## Full search equivalence: original 200 vs cached 200
Thirty legal positions taken from three prior recorded game trajectories; all workers warmed and MCTS tree reuse disabled. Benchmarks alternate call order. Exact comparison checks root PV, NN value, and all reported MCTS root-child visit counts, Q values and priors.

| Metric | Original 200 | Cached 200 (2,048 entries) |
|---|---:|---:|
| Positions matching | reference | **30 / 30** |
| Average wall time | 506.0ms | **333.3ms** |
| Median | 506.3ms | **320.1ms** |
| p95 | 578.6ms | **529.0ms** |
| p99 and worst | 661.8ms | **551.5ms** |
| Over 500ms | 17 / 30 | **3 / 30** |

This is a **34% mean latency reduction** on the tested sequence, not evidence of a guaranteed 500ms move or a general performance distribution. Repeated positions from a few games are correlated. The cache is inference-equivalent where compared, which suggests no gameplay-strength change from caching itself, but exhaustive correctness and live integration remain unproven.

## Cache capacity experiments (same 200-simulation search)
Thirty positions from those same three trajectories, comparing isolated 2,048, 4,096 and 8,192 entry LRU caches with rotated execution order. All three yielded identical legal actions, NN values, root search visit/Q/prior results.

| Capacity | Mean | p95 | >500ms | Hits | Misses | Evictions | Peak sampled RSS |
|---|---:|---:|---:|---:|---:|---:|---:|
| 2,048 | 372.9ms | 545.9ms | 2 / 30 | 3,349 | 2,507 | 459 | 114.1MB |
| 4,096 | 349.4ms | 545.6ms | 3 / 30 | 3,349 | 2,507 | 0 | 116.0MB |
| 8,192 | 361.1ms | 520.6ms | 3 / 30 | 3,349 | 2,507 | 0 | 116.1MB |

**There were zero additional cache hits at larger capacities**. The small and inconsistent latency differences may be run-order, memory or CPU noise rather than useful extra caching. Do not expand the cache capacity on this evidence. Sampled RSS is total Python worker memory, not solely cache memory; process loading and allocator behavior affect it.

## Cold and warm first-move latency (200 cached)
Fresh research Python worker per sample, initial board:
- Cold (worker spawn, model load and first move combined): **806.4, 848.9, 770.2ms**.
- Warm (worker health first): **497.9, 501.4, 483.0ms**; initializing itself took roughly 278291ms.
Neither cold-start nor warm-first conditions guarantee under 500ms. Model preload helps cold start but does not resolve long-tailed wall-heavy positions.

## What was implemented
- `scripts/sigma4-cache-tuned-worker.py`: isolated variant with configurable capacity 2568192, hit/miss/eviction data, sampled RSS. This is NOT the production worker.
- `scripts/sigma4-budget-process.mjs`: research-only `cacheCapacity` selector to run that isolated variant.
- `scripts/sigma4-cache-capacity-screen.mjs`: 30-position capacity screen with exact search-result comparisons.
- `scripts/sigma4-cache200-equivalence-30.mjs`: 30-position original vs 2048 cached search equivalence and p95/p99.
- `scripts/sigma4-cached200-startup.mjs`: cold/warm time measurements.
- `scripts/sigma4-cache200-promotion-audit.mjs`: machine-readable no-promotion gates.
- Results: `evaluation/sigma4-cache-capacity-20261105.json`, `evaluation/sigma4-cache200-original-equivalence-20261105.json`, `evaluation/sigma4-cached200-startup-20261105.json`, `evaluation/sigma4-cache200-promotion-audit-20261105.json`.

## Further work before any promotion
1. Gather independent opening, middle, wall-heavy and late positions across at least 40 distinct fixtures and seat swaps. Verify exact PV and root children against original at 200 simulations.
2. Profile isolated high-cache-miss cases (those still exceeding 500ms), especially non-network Python wall legality/search overhead. Avoid changing the MCTS simulation budget or action selection without fresh strength tests.
3. Preload/persist an inference worker and implement a safe deadline outcome if strict 500ms is required. Timeout-based worker termination can prevent hanging but **does not produce a legal action**, and timer scheduling itself may exceed 500ms.
4. If adding a service opt-in later, preserve ability to roll back on discrepancies; do not treat experimental benchmark results as production approval.

**Gate verdict:** `promotionApproved: false`  latency and independent coverage insufficient.
