# Sigma4 V10 structural wall-value evaluation and independent paired tournament
Date: 2026-11-05

## Decision
**Research only; do not change the live website default SIGMA4.** A new long-horizon-inspired (but only two-ply geometric) wall-value tie-breaker was implemented and tested. It did not improve wins against Sigma2/Sigma3 in 48 completed, paired games, and it did not meet a strict 500ms decision guarantee.

## What was changed
`scripts/sigma4-wall-structure-v10.mjs` evaluates a legal wall candidate using:
- shortest opponent path detour introduced by the wall;
- own path detour introduced by the same wall;
- opponent's legal pawn responses and whether the detour persists after one opponent pawn move;
- a reproducible structural score combining those signals.

The new `chooseSigma4WallStructureV10` starts with the **unchanged V3 immediate-goal safety and root weighted selection**. It runs the structural comparator only if the sampled action and the native MCTS root action are **both walls**. It changes the selected action only when the native MCTS wall has equal-or-better root Q and gains at least one point in the structural score. It does not convert a defensive wall to a pawn move, unlike the rejected V7. No neural network model was retrained; this is an experimental root-policy tie-breaker, not an improved MCTS value network.

## Correctness and nonmutation checks
`scripts/test_sigma4_wall_structure_v10.mjs` tests a wall on a clearly protected enemy route versus a wall that blocks one's own path, forces a root-Q-justified override, tests the reverse-Q and margin filters, and checks native fallback.

It also evaluates 648 wall candidates sampled from 12 seeded legal games: scores are finite and deterministic, and the evaluator leaves the original board state untouched.

## Independent paired 48-game comparison
Six newly generated legal 8-12-ply opening positions (varied pawn and wall moves, deterministic independent RNG seeds). Each is played in both candidate seats against both native Sigma2 and Sigma3, with V3 and V10 paired at identical fixture, seat, candidate PRNG seed, MCTS 200 simulations and weighted-root policy. Native opponents use 200 simulations. No MCTS tree reuse. All 48 games reached a winner under the 200-ply cap. The audit replays all actions through the JavaScript engine and checks legal moves and winners. These are six distinct starts but are still a limited number of independent fixtures.

| Opponent | V3 wins-losses | V10 wins-losses |
|---|---:|---:|
| Native Sigma2 | 7-5 | 7-5 |
| Native Sigma3 | 5-7 | 5-7 |
| Combined | **12-12** | **12-12** |

Across 24 matched fixture/seat/opponent comparisons, V10 had **zero new wins** and **zero lost wins** versus V3. It actually overrode two selected walls. Breakdown of research status across V10 candidate turns: no-comparable-sample 697; non-wall-contrast 73; native-Q-not-better 6; retained 3; replaced 2. A working intervention is not evidence of improved true game strength.

## Candidate move wall-time distribution
The timing includes cached 200-simulation MCTS plus the optional V10 structural calculation, but excludes new process startup and service/network overhead.

| Measure | V3 | V10 |
|---|---:|---:|
| Moves | 781 | 781 |
| Mean | 207.85ms | 205.86ms |
| p95 | 434.20ms | 438.87ms |
| p99 | 552.28ms | 617.51ms |
| Max | 722.69ms | 782.64ms |
| Above 500ms | 15 | 16 |

Timing differences between roughly equivalent policies on this workload are sensitive to OS scheduling, worker cache warm-up and game trajectories. The p95/p99 are not improved; strict 500ms is not guaranteed.

## Research outputs
- `scripts/sigma4-wall-structure-v10.mjs`  scoring function and selective root wall tie-break.
- `scripts/test_sigma4_wall_structure_v10.mjs`  deterministic fixture, gate and 648-case no-mutation tests.
- `scripts/sigma4-v10-independent-duels.mjs` ºw^~)Þt resumable, independent-seeded 48-game paired tournament with complete move actions and source hashes.
- `scripts/sigma4-v10-promotion-audit.mjs` ºw^~)Þt replay legality, paired winner checks, latency quantiles, no-promotion verdict.
- `evaluation/sigma4-v10-independent-sigma23-20261105.json`  complete game actions, actions hashes, statuses and timings.
- `evaluation/sigma4-v10-promotion-audit-20261105.json` ºw^~)Þt audited results.

## Caveats and next experiment
This does not demonstrate improved neural evaluation accuracy. The root tie-break uses hand-coded geometry and opponent pawn response but does not forecast wall counters, forced 3+ ply tactics, or probabilistic human play. The test's Sigma2 worker is the currently available local experimental worker, not necessarily the unmodified historical release (the local working tree contains pre-existing user modifications).

Recommended next steps are **not another arbitrary root heuristic**. First expand independent evaluation coverage to many more seeds and stronger reference opponents, including true wall-heavy midgames, and evaluate tactical search value with complete continuations under a known time cap. If retraining MCTS evaluation is desired, it requires a validated supervised/self-play dataset, holdout losses and calibration before testing new ONNX weights. No promise of universally guaranteed wins can be made.
