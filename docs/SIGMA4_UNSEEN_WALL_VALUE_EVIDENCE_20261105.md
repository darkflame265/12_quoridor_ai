# SIGMA4 independent wall-heavy validation | 2026-11-05

## Verdict
Research-only. Do not change the website default, ONNX neural weights, or current production engine. This study expands evidence and confirms two high-error model review candidates, but does not produce proven optimal-play labels or an independently stronger engine.

## 48 independent reached midgame states
- Generated from 48 different deterministic legal action trajectories, at plies 24-42 with 10-18 walls.
- 36 development states and 12 untouched holdout states, one state per seed. No prior calibration state overlap; checks use a consistent canonical board key without wall owner fields.
- These are synthetic reachable states from wall-biased random legal moves, not 48 completed games or high-quality optimal self-play positions.
- All 48 generated prefixes are replayed and checked for legality, unique state, inventory and nonterminal status.

## Search depth (same unchanged ONNX weights)
- At 200 vs 400 MCTS simulations, first actions match 41/48; 7 differ; root-Q signs agree 46/48.
- 200-sim search mean 421.65ms; 400-sim mean 684.55ms, p95 904.99ms; 400-sim max 947.79ms.
- On the 12 held-out states, chosen actions matched 12/12. This is a limited sample, not a confidence bound.
- Eight high-discrepancy development states were also evaluated at 800 simulations; the 800-sim selected action matched the 400-sim choice in all eight.
- All search budgets use the same ONNX model. More MCTS is not an independent adjudicator or forced-win solver, and 400 or 800 simulations exceed the 500ms target in many cases.

## 32 actual completed games
16 previously unseen generated midgame starting boards, each versus native Sigma2 and Sigma3 (200 simulations), with the existing research Sigma4 V3 weighted candidate at 200 simulations. Eight boards were selected initially, and another eight were deliberately chosen with shortest-path distance gap at most 1. Both opponents were given the same starting board, but candidate seat was assigned once per board rather than swapped: this is NOT a paired seat-balanced engine-strength tournament.

All 32 games reached a terminal winner with no cutoff. Full actions, source prefix, hash and winners pass an automated replay audit. Candidate won 8/16 versus Sigma2 and 8/16 versus Sigma3. These figures do not prove improvement over current Sigma4 or superior performance against Sigma2/3.

Observed-outcome probability scores are always from the perspective of the original player to move on the sampled bank position (player 0), regardless of candidate seat.

| Evaluation set | Starts / games | Original ONNX Brier | 400-sim root-Q Brier | Prior Platt-calibration Brier |
|---|---:|---:|---:|---:|
| All | 16 / 32 | 0.1130 | 0.0763 | 0.1036 |
| Path gap <=1 | 13 / 26 | 0.1391 | 0.0939 | 0.1273 |
| Development | 8 / 16 | 0.2065 | 0.0827 | 0.1884 |
| Holdout | 8 / 16 | 0.0195 | 0.0699 | 0.0187 |

The prior Platt calibration was learned exclusively on the older development set, not these games, and was tested without any refitting. The marginal holdout Brier advantage here is far too small and dependent on too few starts to justify deployment. The old constant-probability baseline failed on this new population. The previous small holdout had much worse original ONNX error; these swings demonstrate strong dependence on the sampled starts and observed policies.

## Development-only high-error review states
The two most concerning states were both path-balanced and the observed side-to-move result agreed in games against Sigma2 and Sigma3:
- independent-wall-040: original ONNX current-player victory probability 93.72%; both sampled games lost. MCTS Q200 -0.130, Q400 -0.192, Q800 -0.096.
- independent-wall-028: original ONNX current-player victory probability 12.86%; both sampled games won. MCTS Q200 +0.068, Q400 +0.078, Q800 +0.082.

Both states have complete boards, full legal prefixes, seeds, search evaluations and source-game outcomes in the development-only review file. They are NOT proven minimax win/loss states, and should not be silently treated as supervised truth.

## Reproducibility and files
- scripts/sigma4-unseen-wall-generator.mjs regenerates and split-validates the 48 states.
- scripts/sigma4-unseen-deep-validation.mjs runs or resumes 200/400 full-root research probes with source hashes.
- scripts/sigma4-unseen-wall-800-review.mjs probes eight development-only discrepancies at 800 simulations.
- scripts/sigma4-unseen-fullgame.mjs and scripts/sigma4-unseen-balanced-fullgame.mjs generate 16 full games each.
- scripts/sigma4-unseen-evidence-audit.mjs replays the independent states, deep results and first 16 games.
- scripts/sigma4-unseen-outcome-audit.mjs verifies all 32 games and measured Brier losses, using the older fixed Platt parameters as a true external check.
- scripts/sigma4-unseen-hard-candidates.mjs writes the two development-only high-error boards.
- All research artifacts are saved in evaluation/sigma4-unseen-wall-* files, with exact seeds, source hashes, full moves and scored probability reports.

## Next threshold
Before any ONNX training, collect substantially more independent balanced wall-heavy games against more varied policies, adjudicate the two high-error boards with stronger tactical and alternative-move continuations, and preserve a final untouched holdout. Model promotion must require calibrated accuracy and statistically credible paired game victories against the unmodified Sigma2, Sigma3 and baseline Sigma4, plus reliable low-tail latency. No existing production code or neural weights were changed.
