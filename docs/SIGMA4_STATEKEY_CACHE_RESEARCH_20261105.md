# SIGMA4 200-simulation ONNX input-key experiment (2026-11-05)

## Status
A research-only improvement was implemented on top of the 200-simulation bitset-wall + 2048-entry ONNX cache worker. It preserves the pretrained model, MCTS simulation count and root policy. The live SIGMA4 default was NOT modified. The experiment does not meet the 500ms p95 gate.

## Implementation
Existing inference caching constructs an entire (8,9,9) float32 tensor and hashes its bytes before checking the cache, even when an evaluation is cached.

The experiment uses a compact Python tuple of the state fields that determine all eight network input planes: board size and player-to-move parity, pawn coordinates, wall counts and normalization, and complete horizontal/vertical wall bitmaps. Neural tensors are built only on cache MISS using the original State.to_nn_input(). Cache remains a 2048-entry LRU.

Instrumentation with three consecutive searches of the initial state (200 simulations): first search 43 hits / 159 misses / 159 tensor builds; second and third searches each 202 hits / 0 misses / 0 tensor builds.

## Exact MCTS equivalence
The new cache key was compared against the prior bitset worker on 30 recorded positions and 14 previously constructed wall-heavy positions. All 44/44 root PVs, neural root values and MCTS child Q/visits/priors matched. Not an exhaustive proof for all positions, nor a full-game strength test.

## Timing in a noisy, high-load run
| Dataset | Earlier bitset mean | State-key mean | Earlier p95 | State-key p95 | Above 500ms |
|---|---:|---:|---:|---:|---|
| Recorded 30 | 585.28ms | 564.00ms | 1034.23ms | 1038.07ms | 17/30 each |
| Wall-heavy 14 | 680.10ms | 663.54ms | 1084.86ms | 1078.27ms | 13/14 vs 9/14 |

The environment was substantially slower than earlier benchmark sessions, so the apparent 2-4% mean improvement may be load noise. No stable p95 improvement or strict 500ms completion was established.

## Research assets
- scripts/sigma4-bitset-statekey-worker.py: experimental input-key cache worker
- scripts/sigma4-budget-process.mjs: opt-in bitsetStateKey switch
- scripts/sigma4-statekey-30-benchmark.mjs and scripts/sigma4-statekey-fresh-benchmark.mjs
- scripts/sigma4-statekey-verdict.mjs
- evaluation/sigma4-statekey-30-20261105.json
- evaluation/sigma4-statekey-fresh-20261105.json
- evaluation/sigma4-statekey-verdict-20261105.json

## Decision and next work
Research-only. Do not promote to the website or claim 500ms performance. Next steps: controlled low-noise repetitions to measure p95/p99, persistent worker preload, profile remaining ONNX inference and bitset-wall costs, and independent full-game comparisons. If a strict deadline is required, safe legal-move fallback and cancellation are needed; simply killing a worker after a deadline cannot deliver a move.
