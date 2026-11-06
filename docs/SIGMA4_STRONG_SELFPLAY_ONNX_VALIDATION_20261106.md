# SIGMA4: real engine-generated midgame data and corrected-ONNX validation
Date: 2026-11-06

## Decision

**Do NOT promote the research residual ONNX model.** It reduced Brier error on the previous hand-selected/synthetic datasets, but **regressed on genuine engine-generated midgames**, lost its direct head-to-head matches against the original model, and had worse mean/p95 latency. The live website default and original `vendor/sigma-quoridor/models/best.onnx` are unchanged.

## Dataset construction

`scripts/sigma4-strong-selfplay-midgames.mjs` plays from the standard legal initial Quoridor position using two existing 200-simulation MCTS policies: the original bitset-cached SIGMA4 research worker with V3 weighted/safety selection versus the native-root SIGMA3 worker. This was **actual engine-vs-engine game play**, not arbitrary placement of walls.

- 16 seed/target attempts for midgame snapshots at plies 20, 24, 28, or 32.
- 11 distinct reachable nonterminal positions accepted (9-17 placed walls), with five failed/duplicate attempts excluded. Different random seeds do not guarantee independent states; duplicate canonical board positions were rejected.
- The first 10 distinct positions were used for testing: 7 designated development and 3 designated holdout **before new match outcomes were generated**. The remaining one is saved for later evaluation.
- Positions include the legal full opening trajectory, side to move, wall inventories and geometry, seed, file/worker source hashes, and complete board state.
- Source states were excluded if already in older calibration/synthetic datasets. The source is stronger and more realistic than random-wall sampling, but still shares network/policies and may favor some opening lines.

## Full engine comparisons

`scripts/sigma4-strong-selfplay-onnx-tournament.mjs` evaluates each of the ten collected positions in six complete games:
- Two **direct baseline-versus-corrected** games with engine roles swapped between player seats (20 total).
- Four **matched external opponent** games: original or corrected SIGMA4 against a fixed Sigma2 or Sigma3 opponent, and both candidate seats (40 total, forming 20 original/corrected pairs).

All engines use the 200-simulation search setting. The original and corrected candidates both use the exact same V3 weighted/safety root selection; only the MCTS neural value is corrected in the research variant. Games were run to a winner with a maximum 200-ply cap; none reached the cap. Seeds and full action histories, source prefixes and decision timings were recorded. The local Sigma2 worker contains unrelated pre-existing user changes, so native Sigma2 in this study is not asserted identical to a previous unmodified version.

An independent `scripts/sigma4-strong-selfplay-onnx-audit.mjs` replays the source trajectories and all 60 matches, validates each move, winner, opening hash and pairing, and computes latency and distinct-source-group statistics.

### Results

| Comparison | Original best.onnx | Corrected residual ONNX |
|---|---:|---:|
| Direct head-to-head (20 games) | **12 wins** | 8 wins |
| External vs SIGMA2/SIGMA3 (20 games each) | **10 wins** | 9 wins |
| External against Sigma2 (12 matched comparisons) | 6 wins | 5 wins |
| External against Sigma3 (8 matched comparisons) | 4 wins | 4 wins |
| Warm decision mean | **161.2ms** (756 moves) | 172.7ms (775 moves) |
| Warm decision p95 | **391.0ms** | 396.7ms |
| Warm decision p99 | 500.6ms | **499.3ms** |
| Decisions >500ms | 9/756 | 7/775 |

External comparisons: one match improved, two matches regressed, 17 matches unchanged. On the **three source-group holdout positions**, original won 4/6 direct games, corrected won 2/6. In matched external games on these holdout sources, original won 4/6, corrected 2/6; 0 gained wins and 2 lost wins.

The 60 games represent only ten distinct starting situations, some already significantly favorable for one seat. Direct role reversals and matching scenarios share starting positions, so the aggregate count is not 60 independent samples. No credible superior win rate has been established for the corrected model.

## Prediction accuracy on genuine engine selfplay positions

`scripts/sigma4-strong-selfplay-value-audit.py` evaluates **the exact same ten source boards** with the original frozen ONNX value head and the research correction ONNX value head; it does NOT retrain or recalibrate either model. Each of the six completed continuation games per source supplies one policy-conditioned observed winner. Brier error is averaged within each of the ten source boards, keeping the effective source-group sample count clear.

| Sample | Independent boards | Original ONNX Brier | Research corrected ONNX Brier |
|---|---:|---:|---:|
| All tested strong-policy midgames | 10 | **0.1091** | 0.1521 |
| Seven development-designated sources | 7 | **0.0882** | 0.1249 |
| Three holdout-designated sources | 3 | **0.1579** | 0.2154 |

On the ten source boards the corrected value made better predictions on only 2/10. This **reverses the earlier results** on synthetic or previous small holdout data where the corrected head reduced Brier error. The discrepancy suggests substantial **domain/label shift** and risk of learning shortcuts from limited, correlated, policy-conditioned training data. This is a diagnostic association, not a controlled proof of the exact cause.

## Reproducibility / assets

- `scripts/sigma4-strong-selfplay-midgames.mjs`  actual engine selfplay-based legal state sampling; source hashes and uniqueness checks.
- `evaluation/sigma4-strong-selfplay-midgames-20261106.json`  16 attempts, 11 accepted source midgame boards, original legal prefixes and provenance.
- `scripts/sigma4-strong-selfplay-onnx-tournament.mjs` ºw^~)Þt 60 complete direct/matched game rollout runner with resumability and source-hash-locking.
- `evaluation/sigma4-strong-selfplay-onnx-tournament-20261106.json`  all 60 complete games and timing data.
- `scripts/sigma4-strong-selfplay-onnx-audit.mjs`  legal full replay and paired win/latency checks.
- `evaluation/sigma4-strong-selfplay-onnx-audit-20261106.json`  20 head-to-head wins, 20 external pairs, three holdout group splits and measured decision latency.
- `scripts/sigma4-strong-selfplay-value-audit.py` and `evaluation/sigma4-strong-selfplay-value-calibration-20261106.json` ºw^~)Þt original vs corrected ONNX probability evaluation on ten **unchanged** strong-policy source boards.
- `scripts/sigma4-strong-selfplay-promotion-gate.mjs` and `evaluation/sigma4-strong-selfplay-promotion-gate-20261106.json` ºw^~)Þt deterministic promotion rejection.

## Why no deployment

All stated release gates for the correction fail:
- too few independent strong-engine-generated source boards;
- corrected model loses head-to-head and matched external opponent comparison;
- corrected probability model is **worse on both new strong-policy calibration groups**;
- average and p95 move calculation time regress, and strict sub-500ms is not guaranteed.

The research corrected ONNX and prior 8x9x9 base model are preserved unchanged and continue to be available for offline research. Production files and default engine are untouched by this turn.

**Next recommended research:** sample a larger, truly diverse distribution of balanced midgame positions from several strong policies and opening seeds; measure evaluation mistakes relative to policy-conditional outcomes and stronger tactical counterfactuals; train on many more independent source games, and reserve a final blind group of engine-generated starts that is never used for model selection. Avoid another production value heuristic until a new model improves independent paired game wins and tail latency.
