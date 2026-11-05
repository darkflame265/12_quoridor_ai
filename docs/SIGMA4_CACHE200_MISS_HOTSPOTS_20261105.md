# SIGMA4 200-sim cached-worker miss bottlenecks (2026-11-05)

## Decision
Keep the existing research-only 2,048-entry ONNX cache with 200 MCTS simulations. Do not change website SIGMA4 or the current default. Three isolated experimental modifications were benchmarked, and none passed the p95 latency-tail acceptance test. All experimental root outputs were identical to the ONNX-only baseline in the 30 states evaluated per candidate.

## Actual cost on low-hit positions
A cProfile instrumented copy of the cache worker evaluated three historical midgame positions, with 200 simulations in each.

| Position | ONNX cache misses out of 202 calls | ONNX inference cumulative | Legal wall action enumeration cumulative |
|---|---:|---:|---:|
| 0-8 | 161 | 265ms | 196ms |
| 1-16 | 184 | 294ms | 221ms |
| 1-28 | 188 | 287ms | 176ms |

This is profiling time (cProfile adds overhead). Inference and wall checks are two significant sources of time in low-cache-hit positions. The is_finished cumulative time includes nested legal-action generation, so do not add these function totals together.

## Three research optimizations, each tested on 30 recorded positions
| Candidate | Original mean | Candidate mean | Original p95 | Candidate p95 | Decision |
|---|---:|---:|---:|---:|---|
| 512-entry wall action cache, in addition to ONNX | 333.4ms | 320.4ms | 498.5ms | 516.1ms | Reject: worse p95 |
| Fast terminal shortcut | 332.0ms | 340.3ms | 514.4ms | 539.6ms | Reject: worse mean and p95 |
| Memoize per-state position key | 334.3ms | 340.3ms | 505.8ms | 511.9ms | Reject: worse mean and p95 |

All 30 root PVs, NN root values, and root-child visits/Q/prior data matched their respective ONNX-cache baselines. No strength improvement is proven. Results come from sequential benchmarks with variation in CPU load; tiny mean differences should not be overinterpreted.

## Further validation of existing 200-sim ONNX cache
13 legal middle and late positions from three other recorded game trajectories, at plies 44-68, with 16-20 placed walls.
- Exact match in PV, root NN value, and all root-child search data: 13 of 13.
- Cached mean wall time 189.7ms, p95 420.7ms, no move over 500ms in this set.
- Adding the prior 30 positions: 43/43 matches against original 200-sim inference, but these are not 43 statistically independent games.
- These late positions often have limited wall placement resources and cannot substitute for extensive fresh wall-heavy holdouts.

## Reproducible research files
- scripts/sigma4-cache-cprofile-worker.py; scripts/sigma4-cache-miss-cprofile.mjs; evaluation/sigma4-200-cache-miss-cprofile-20261105.json
- scripts/sigma4-cache-wall-worker.py; scripts/sigma4-cache200-wall-actions-screen.mjs; evaluation/sigma4-cache200-wall-actions-screen-20261105.json
- scripts/sigma4-cache-fastterminal-worker.py; scripts/sigma4-cache200-fastterminal-screen.mjs; evaluation/sigma4-cache200-fastterminal-20261105.json
- scripts/sigma4-cache-positionkey-worker.py; scripts/sigma4-cache200-positionkey-screen.mjs; evaluation/sigma4-cache200-positionkey-20261105.json
- scripts/sigma4-cache200-lategame-equivalence.mjs; evaluation/sigma4-cache200-lategame-equivalence-20261105.json
- scripts/sigma4-cache200-hotspot-verdict.mjs; evaluation/sigma4-cache200-hotspot-verdict-20261105.json
- scripts/sigma4-budget-process.mjs: independent opt-in settings for rejected experiments. Production code is untouched.

## Next useful work
Examine the actual expensive wall legality enumeration and ONNX scheduling with controlled benchmarks, and evaluate on new independent wall-heavy positions. Strict 500ms is still not guaranteed: the prior full 30-position cache study measured p95 about 529ms, and cold worker start is 770-849ms. Do not promote any of these changes until complete-action latency, correctness, and unrelated project regressions are checked.
