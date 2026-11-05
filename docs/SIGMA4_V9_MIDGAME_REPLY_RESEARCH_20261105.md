# SIGMA4 V9: selective midgame opponent-reply search
Date: 2026-11-05

## Decision
**Do not promote V9 to the website's default engine.** New opt-in research implementation and verified tournament evidence are committed separately from the live app. It does not improve wins against Sigma2 or Sigma3 in the tested pilot and causes worse long-tail latency.

## What V9 does
V9 starts from the Sigma4 V3 tactical safety policy and a 200-simulation Sigma3-model MCTS with the verified ONNX cache and bitset wall legality. During middle plies 10 through 42 only, when V3's weighted selected action differs from native root MCTS and a route/Q danger signal is present, V9 researches **both** candidate moves using a separate warmed 50-simulation Sigma3 opponent worker. Each response is actually applied, and a legal reply's own/opp shortest-path and wall difference is scored. An additional margin >=2 in favor of native causes a fallback to the native root action.

The additional reply searches run sequentially to avoid concurrent CPU contention. When root engine time already exceeds 650ms, a reply search fails, the root action is invalid, or there is no significant disagreement, the policy leaves V3's original safety decision unchanged. **This is not an end-to-end 500ms deadline**: the 650ms gate only prevents starting *additional* work late. Two optional reply searches may further increase response time. No worker-cancellation guarantee is claimed.

## New independent-opening pilot
Three newly authored legal six-ply openings, with one or two placed walls, both candidate seats; native Sigma2 and native Sigma3 at 200 simulations. Candidate variants V3 and V9 each use the same 200-simulation root worker, seed and weighted root policy. V9 alone has conditional supplemental 50-simulation opponent research. No tree reuse, 200-ply cap; all 24 games reached a winner without cutoff. All move lists and final winners were replayed and checked by the independent audit.

| Native opponent | V3 wins/losses | V9 wins/losses |
|---|---:|---:|
| Sigma2 | 2-4 | 2-4 |
| Sigma3 | 3-3 | 3-3 |
| Combined | **5-7** | **5-7** |

Across 12 matched fixture/side/opponent pairs, **0 additional V9 wins** and **0 wins lost** relative to V3. V9 actually rejected seven sampled midgame actions after reply research; these changes did not affect the final paired win/loss outcome.

V9 status counts from candidate turns: 7 rejected, 14 compared and accepted, 4 quiet, 173 no-disagreement, 152 outside-midgame, 6 root-over-budget. The extra opponent-search cost is not justified by verified strength improvements in this sample.

## Warm candidate move latency (full root + optional reply decision)
| Metric | V3 | V9 |
|---|---:|---:|
| Total candidate moves measured | 354 | 356 |
| Mean wall time | 232.2ms | 240.8ms |
| p95 (nearest rank) | **492.5ms** | **702.6ms** |
| p99 | 767.5ms | 771.0ms |
| Above 500ms | 16/354 | 25/356 |

These are correlated game moves and hardware-dependent, not an independently randomized latency benchmark. V9 is not appropriate as a drop-in replacement for a 500ms real-time move requirement.

## Test and evidence files
- scripts/sigma4-midgame-reply-v9.mjs: opt-in opponent-reply gate, no production import.
- scripts/test_sigma4_midgame_reply_v9.mjs: mocked-root unit test for rejection, acceptance, outside-midgame skip, root budget skip and research failure fallback.
- scripts/sigma4-v9-independent-duels.mjs: full-game tournament, resumable only if settings/source hashes match.
- evaluation/sigma4-v9-independent-sigma23-20261105.json: full moves, candidate timing samples, outcome, source settings and V9 interventions.
- scripts/sigma4-v9-promotion-audit.mjs and evaluation/sigma4-v9-promotion-audit-20261105.json: replay legal moves and check matched seeds/prefixes and no-promotion evidence.

## Research limitations
Three openings are a modest pilot, not a large independent tournament or proof that V3 and V9 have the same true strength. Different pilot fixtures may produce different win rates. The V9 opponent's 50-simulation single reply is not a minimax adversarial proof and its heuristic value does not necessarily predict an eventual win. Better standalone threat verification needs search-aware time limits and more opponent response lines.

## Recommendation
Keep the present production default and the V3-style research guard. Instead of further broad reply searches on every divergence, perform a broader blind evaluation of genuinely distinct starting, wall-heavy, and late-game positions. A future improvement needs to demonstrate a statistically meaningful improvement against Sigma3 without violating the move budget. The current evidence does **not** justify promoting V9 or claiming it is stronger than Sigma2/3.
