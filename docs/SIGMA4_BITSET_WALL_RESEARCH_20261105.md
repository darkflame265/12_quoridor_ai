# SIGMA4 bitset wall-legality optimization  research, 2026-11-05

## Status and decision
A new research-only Sigma3 worker performs **200 full MCTS simulations**, retains the previously verified **2,048-entry ONNX cache**, and replaces expensive temporary wall placement + BFS legality checks with 81-bit integer connectivity. This preserves the existing root policy, neural model, game-state semantics, and total simulation count. The live website default is **unchanged**; strict 500ms and game-strength gates are not met.

## Algorithm
Quoridor 9x9 has 81 cells. Encode each open positive-X and positive-Y grid edge as one bit at its source cell. A candidate horizontal wall removes two adjacent up-edge bits; a vertical wall removes two right-edge bits. Reachability from each pawn to its goal row is propagated by shifts and AND masks on Python arbitrary-precision integers until the frontier becomes empty or touches the goal. Keep the original wall-overlap checks, player wall inventory check, shortest-path-edge pruning, and exact original candidate enumeration order. No temporary mutation of wall bytearrays is necessary.

All changes are isolated to `scripts/sigma4-bitset-wall-worker.py` and an explicit `bitsetWall: true` option on the research-only `SigmaProcess`; no production Python worker is modified.

## Direct legal-action equivalence (random deterministic games)
| Board | States checked | With >=10 placed walls | Max placed walls | Original wall-list generation | Bitset wall-list generation |
|---|---:|---:|---:|---:|---:|
| 9x9 | **1,799** | 1,412 | 20 | 347.55ms aggregate | **145.17ms aggregate** |
| 7x7 | **506** | 292 | 10 | 42.2ms aggregate | **21.1ms aggregate** |

All wall-action arrays matched **element-for-element in legal action and ordering** in 2,305 generated states. The 9x9 wall generation subroutine was about **58% faster** on this workload. This is not the whole engine speedup. Direct random tests do not prove all legal Quoridor positions; drawn/repetition and illegal-board paths remain under-tested.

## MCTS exact-result equivalence at 200 simulations
In three complementary collections, exact root PV, root NN value and all captured root child statistics (visits, Q and priors) matched:
- **30 previously recorded training positions**, original cached200 vs bitset+cached200.
- **13 middle/late game positions**, 16ºw^~)Þw20 walls placed.
- **14 newly constructed, legal wall-heavy positions** from deterministic seeds, with 6ºw^~)Þw17 walls placed.

Total **57 of 57 MCTS root results matched**. All were search evaluations, not 57 complete games. These positions have dependencies and the samples do not establish a statistical guarantee of equivalence in all future games.

## Measured complete 200-simulation research search latency
| Dataset | ONNX-only cache mean | ONNX + bitset mean | Baseline p95 | Bitset p95 | Above 500ms |
|---|---:|---:|---:|---:|---|
| Previously recorded (30) | 332.33ms | **315.29ms** | 519.17ms | **505.69ms** | 2/30 for both |
| Newly constructed wall-heavy (14) | 426.45ms | **393.27ms** | 555.36ms | **512.00ms** | 4/14 vs **1/14** |

The late game 13-position bitset cohort had mean 193.60ms, p95 381.62ms, and 0/13 above 500ms; direct search equivalence was asserted against the original ONNX-only cached worker.

Benchmarks use warmed isolated Python workers, no tree reuse, and alternating order in the first and fresh-cohort tests. CPU load and cache warmth affect timings. The worst tail still exceeds 500ms. Cold-start latency and MCTS-game win rate are not solved by this modification.

## Research assets
- `scripts/sigma4-bitset-wall-worker.py`: ONNX cached 200-sim worker with bitset wall legality.
- `scripts/sigma4-budget-process.mjs`: opt-in `bitsetWall` switch, never default.
- `scripts/test_sigma4_bitset_wall_legality.py`, `scripts/test_sigma4_bitset_wall_legality7.py`: random legal-state wall list and ordering equivalence.
- `scripts/sigma4-bitset-wall-benchmark.mjs`: historical 30-position MCTS equivalence and latency.
- `scripts/sigma4-bitset-wall-lategame.mjs`: 13 additional middle/late-position equivalence.
- `scripts/sigma4-bitset-fresh-wallheavy.mjs`: 14 newly generated wall-heavy positions.
- `scripts/sigma4-bitset-wall-verdict.mjs`: research acceptance, production promotion rejection.
- Corresponding `evaluation/sigma4-bitset-*.json` reports contain settings and samples.

## Next step / promotion gate
This improvement reduces legality-check work and preserves sampled actions, but **does not establish a 500ms strict deadline**. Keep it experimental. Further engineering should profile the low-cache-hit cases on the bitset worker and investigate inference cost and safe full-decision deadline behavior while retaining 200 simulations. Before live integration, test many more independent complete games and repetition/terminal edge states against the original worker, including a way to roll back on a mismatch.
