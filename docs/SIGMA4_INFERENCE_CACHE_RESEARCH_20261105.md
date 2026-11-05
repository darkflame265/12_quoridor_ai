# SIGMA4 ONNX inference caching and unseen strength screen

Date: 2026-11-05. Research only. No live website engine or default was changed.

## Research change
`scripts/sigma4-cache-worker.py` is an isolated copy of the existing Sigma3 ONNX+MCTS worker with an in-process bounded 2048-entry LRU. Neural inputs use the exact float32 tensor bytes as cache key; cached model outputs are only read (not mutated). Both the initial policy/value inference and subsequent MCTS evaluations participate. Cache is local to a worker, not persistent on disk. Memory overhead is bounded by the number of entries, but actual process memory was not measured.

`scripts/sigma4-budget-process.mjs` now distinguishes `profile`, `optimized` and `cached` switches explicitly. It also fixes the earlier bug that overwrote the `profile` boolean with the engine variant, which silently selected the instrumented profile worker even when profile was false.

## Strength screen on newly constructed six-ply opening positions
Paired 100-sim weighted Sigma3 vs 200-sim weighted Sigma3: **100-sim 4W-2L; 200-sim 2W-4L**, in three newly constructed starting positions with both seats. A small pilot, not proof that 100 simulations are stronger. Full sequences are in `evaluation/sigma4-budget-unseen100-vs-200-20261105.json`. No cutoff. Simulation counts were varied through the isolated worker, with the same frozen model and weighted choice policy. Not a match against Sigma2.

## Caching benchmark, 100 simulations
Twelve consecutive research-game positions, unchanged policy and no tree reuse:
- Original evaluated before cached: mean **343.06ms** vs cached **252.39ms** (26.4% lower). 540 cache hits, 684 misses.
- Order reversed: original mean **313.89ms** vs cached **239.21ms** (23.8% lower), same hits/misses.
- Mean times are per completed worker request with warm processes; no inference of real-time guarantee or p95.

## Caching benchmark, 200 simulations
Eight consecutive positions: uncached mean **596.65ms**, cached mean **429.45ms** (28.0% lower). 765 hits, 851 misses. Cached 200-sim requests still exceeded 500ms in 2/8 positions. This technique cannot by itself guarantee a 500ms end-to-end move.

## Equivalence
`node scripts/test_sigma4_cache_equivalence.mjs` runs identical research positions with both original and cached workers at 100 and 200 sims. Across 12 comparisons, **the PV, root neural value, MCTS root child visits, priors and root Q values all matched exactly**, including 730 cache hits. It validates functional equivalence of the tested states, not every possible board or multi-worker scenario. No neural network was retrained.

## ONNX session thread tuning was not adopted
An isolated worker configured with ORT intra-op thread 1 averaged **578.16ms** vs baseline **268.42ms** across a paired 100-sim 4-position test (2 measurements each per position). Spot-checks at 2, 4 and 8 threads also did not show a reliable advantage over the default. Keep the default ORT session settings. The thread spot-checks were not controlled enough to assert a universally optimal count.

## Files
- `scripts/sigma4-cache-worker.py`: experimental 2048-entry ONNX cache worker
- `scripts/sigma4-budget-process.mjs`: isolated worker switches
- `scripts/sigma4-cache-compare.mjs`, `scripts/sigma4-cache-reverse.mjs`, `scripts/sigma4-cache-200-compare.mjs`: timing comparisons
- `scripts/test_sigma4_cache_equivalence.mjs`: exact research equivalence tests
- `scripts/sigma4-budget-unseen-strength.mjs`: 100-vs-200 paired opening screen
- `scripts/sigma4-ort-optimized-worker.py`, `scripts/sigma4-ort-compare.mjs`: rejected thread=1 experiment
- Respective JSON outputs are in `evaluation/` and identify settings and actual moves.

## Next steps before promotion
Independent full-game paired comparisons against Sigma2/Sigma3 and 200-sim weighted original under the target hardware and load; repeated latency distributions including cold start, p95 and p99; memory pressure of 2048 cache entries; same exact result equivalence with more complex wall and repetition positions; evaluate cache memory use/worker recycling; cooperative cancellation or a safe completed-action fallback if the 500ms deadline is strict. Do not promote to live Sigma4 or alter the website's default from this small evidence set.
