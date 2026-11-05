# SIGMA4 cached-100 matched screening and latency evidence  2026-11-05

**Status: research only; no promotion to live website.** All experiments use isolated workers. The existing Sigma4 default and other preexisting dirty files remain untouched.

## Goal and method
Evaluate the 100-simulation ONNX-LRU-cached Sigma3 + original Sigma4 weighted root-choice research policy against the original 200-simulation weighted policy. Freeze the underlying ONNX model and root policy. Two newly authored legal six-ply opening fixtures, both candidate seats, three opponent categories (native Sigma2/200, native Sigma3/200 and stochastic weighted Sigma3/200). Both candidates play the same fixture/seat/opponent combinations. No PUCT tree reuse, deterministic native workers, max 200 plies. The same state-dependent stochastic weighted choice parameters are used for candidate versions. The report contains game sequences, sources hashes, measured per-candidate-move wall times, and resume settings. The opponent's native Sigma2/Sigma3 picks do NOT use the research weighted picker; only the weighted200 opponent does.

**Crucial limitations:** only **two distinct initial fixtures**, despite 24 completed games; the fixtures were chosen before seeing outcomes but this is not a statistically adequate independent strength proof. The weighted200 vs original200 self-match has identical underlying engine strengths and different random root-choice streams; its 4-0 record illustrates sampling noise, not proof original200 beats itself.

## Results: candidate wins per 4 games against each opponent
| Opponent | Original weighted 200 | Cached weighted 100 |
|---|---:|---:|
| Native Sigma2 (200) | 3W 1L | 2W 2L |
| Native Sigma3 (200) | 2W 2L | 2W 2L |
| Weighted Sigma3 (200) | 4W 0L | 2W 2L |
| Combined | **9W 3L** | **6W 6L** |

No game reached the 200-ply cap and no cutoff/draws occurred. **The proposed cached100 policy did not establish non-inferiority or a strength advantage. Do not promote.** The version 100 vs 200 comparison changes simulation budget and caching simultaneously; caching itself is inference-equivalent in prior validation, but separate causal contribution must not be confused with simulation-count difference.

## End-to-end move timing, warm worker (root search + weighted selection + protocol)
| Measure | Original 200 (393 moves) | Cached 100 (377 moves) |
|---|---:|---:|
| Mean | 412.99ms | **149.12ms** |
| Median | 474.39ms | **140.99ms** |
| p95 (nearest rank) | 585.74ms | **283.18ms** |
| p99 | 662.26ms | **534.28ms** |
| Maximum | 836.83ms | **567.70ms** |
| Above 500ms | 160/393 (40.7%) | **4/377 (1.1%)** |

Cached100 moves had 21,264 cache hits and 11,494 cache misses across measured games (about 64.9% cache hit ratio across worker inference lookups). End-to-end request time here excludes process creation, network transit and browser UI rendering. Timing samples within games are correlated; the apparent speed advantage is large but these are not independent machine-load samples.

## Cold startup check
Three new 100-sim cached worker starts (worker loading included): **610.57ms, 556.90ms, 529.88ms**, all exceeded 500ms. After explicit worker health/initialization, first-search times were **241.62ms, 235.64ms, 240.62ms** (worker init itself about 280294ms). The research-only 500ms process termination from prior work is not wired into the web runtime. No exact real-time deadline guarantee.

## Cache correctness and bounded memory
The existing equivalence test at 100/200 simulations checked identical final actions, root values and MCTS root child visits/Q/priors over 12 paired state evaluations (730 cache hits).
New LRU-bound check processes 73 additional states drawn from recorded match trajectories; caches 4,834 evaluations, executes 2,058 misses and reaches exactly 2,048 entries without exceeding the cap. It does **not** measure actual process RSS or confirm equivalence for every possible legal board.

## Files
- `scripts/sigma4-cache100-independent-paired.mjs`: resumable 24-game comparison with source hashes and full move timing. Output `evaluation/sigma4-cache100-independent-paired-20261105.json`.
- `scripts/sigma4-cached100-startup.mjs`: new-worker/cold timing. Output `evaluation/sigma4-cached100-startup-20261105.json`.
- `scripts/test_sigma4_cache_lru_bound.mjs`: 2,048-entry LRU cap. Output `evaluation/sigma4-cache100-lru-bound-20261105.json`.

## Decision and next gate
Keep existing web Sigma4 default unchanged. Caching is a promising optimization independent of reducing MCTS from 200 to 100, but **deploying either** requires more unseen seed/position coverage (suggest 40+ independent initial fixtures per opponent, both seats), fair engine policies, move latency p95/p99 under realistic load, cold-start mitigation, direct 200-sim cache comparison, and an explicit safe decision policy on >500ms outcomes. The new research candidate is faster but has not preserved strength convincingly.
