# SIGMA4 balanced midgame evidence expansion and data-readiness gate
Date: 2026-11-06

## Decision

Research pipeline applied; **do not retrain or promote a new ONNX model yet**. The new dataset is wider, legal, and leakage-controlled, but the policy-conditioned outcome labels remain severely biased toward wins by the player to move. The existing `best.onnx`, research correction ONNX, and website default SIGMA4 were not modified.

## Why this experiment differs from the previous one

Earlier strong-policy selfplay yielded only 11 distinct positions from 16 deterministic runs, with repeated openings. To diversify, this experiment used three source conditions from genuine legal MCTS play, starting from the initial board: V3-weighted Sigma4, native Sigma3, and an occasional alternative move **already visited by MCTS at least five times** with root Q no more than 0.16 below the best visited choice, and filtered against immediate goal-in-one loss. This was not arbitrary random-wall placement. The three policies still share a neural network, so statistical independence is limited.

For each attempted trajectory, checked snapshots at plies 20, 24, 28, and 32; retained **one** legal board per trajectory only if (a) not previously seen, (b) 717 walls already placed, and (c) absolute difference in shortest goal-path lengths <=2. Of 32 attempts, 19 distinct previously unseen snapshots passed. Their actual values were more constrained: 815 placed walls and path differences only -1, 0 or +1. No boards overlap the old calibration, synthetic bank, or strong selfplay source bank.

The original source policies yield 9 weighted, 1 native-root, and 9 MCTS-supported-branch source positions. This asymmetry is a **limitation**, not independent variety across three well-balanced policies.

Research source split is fixed before outcome generation (by source attempt number), preserving full trajectory groups: 14 development and five holdout in the complete bank. First sixteen accepted source boards were used for completed games: 11 development and five holdout. Remaining three source groups remain unlabeled, useful for future independent evaluation.

## Extra opposite-to-move snapshots

For each retained snapshot, reconstructed the immediately preceding legal board (one ply earlier), verifying history, legal actions, wall counts, no duplicates and the SAME split as the parent. Seventeen additional legal balanced board snapshots passed, so the research pool contains **36 distinct board states from 19 original source trajectory groups**, *not 36 independent games*. These 17 are player-1-to-move, correcting the even-ply-only perspective skew of original snapshots. Do not independently split or count an adjacent prior-ply board from its parent.

For 14 predecessor snapshots whose even-ply parent was among the 16 tested source boards, observed outcomes from the 64 even-board games were also reviewed **only conditional on the source's last action being forced**. This is not a fresh search or independent game from the odd board, and the resulting 14 conditional sets are **not approved as training targets**.

## 64 actual completed policy games

The first 16 distinct source boards were each played in four 200-simulation research policy combinations until a terminal winner:
- weighted Sigma4-V3 root vs native Sigma2;
- native-root Sigma4/Sigma3 vs Sigma2;
- weighted Sigma4-V3 root vs Sigma3;
- native-root Sigma4/Sigma3 vs Sigma3.

All 64 games reached a winner before the ply-200 cap. The `sigma4-diverse-strong-outcome-audit.mjs` script independently replays every move from the initial state, verifies the source prefix, winner, recorded action hashes, opponent/policy pairing and source group partition.

Four policy games from the same board are correlated and count as only one source group. Across 16 source groups, **14 showed unanimous observed outcomes and two had contradictions**:
- `diverse-strong-018`: 3 observed wins / 1 loss for original side to move.
- `diverse-strong-024`: 3 observed wins / 1 loss.

The observed mover won **58 of 64 games (90.625%)**, indicating major positive-class selection bias despite the original board shortest-path differences being balanced. Only **one** development source board was unanimously losing, versus eight unanimously winning development boards. Both conflicting development sources were quarantined from hard-label training candidate data. All five holdout source groups observed only wins. These five groups were never used for any model fitting or epoch selection, but are NOT a balanced blind generalization test.

## Frozen neural value accuracy on genuinely varied midgames

Original frozen `vendor/sigma-quoridor/models/best.onnx` and previously trained `evaluation/sigma4-value-residual-research-20261106.onnx` were evaluated on the **identical** 16 starting boards with no retraining. Win probabilities were compared against all four conditional outcomes per board, and Brier losses were averaged by source group. Lower is better.

| Group | Distinct boards | Original ONNX Brier | Previous research correction Brier |
|---|---:|---:|---:|
| All | 16 | **0.14840** | 0.18320 |
| Development only | 11 | **0.10668** | 0.17214 |
| Holdout only (5 all-winning boards) | 5 | 0.24016 | **0.20754** |
| Weighted source style | 7 | **0.08731** | 0.09470 |
| MCTS-constrained alternate source style | 8 | **0.22027** | 0.28234 |

The correction improves this *very small all-winning holdout* but regresses on the overall set and on the source styles most useful for variety. The holdout-only result is not proof of strong generalization.

For the 14 odd-ply predecessor boards with **forced-next-source-move conditional** outcomes: original Brier **0.14006**, research correction Brier **0.15593**; the observed original mover's conditional win fraction is **10.7%**. This comparison is a diagnostic about turn-perspective/model stability, not 14 new independent matches. Importantly, source trajectory groups remain coupled across even and odd perspectives.

## Automatic readiness gate

`scripts/sigma4-diverse-strong-data-readiness.mjs` verifies legal sources, absence of old data overlap, all 64 game outcomes, exact original/correction ONNX file hashes and disjoint group splits. It **rejects** full value-network training or production promotion because:
- 19 independent source trajectories is far fewer than the research aspiration of 50+, still with common base models;
- development candidate labels are eight wins versus one loss; all five labeled holdout sources are wins;
- full-source and opposite-turn conditional calibration do not consistently improve with the research correction;
- no evidence of new independent matched playing-strength wins or strict 500ms latency.

The numeric source-count and losing-position gates are provisional engineering standards, **not statistically proven minimum dataset sizes**. The key principle is to avoid retraining on seriously biased correlated labels.

## Reproduce

1. `node scripts/sigma4-diverse-strong-midgame-bank.mjs`  resumable 32 seeded MCTS trajectories with a carefully constrained alternate-root selection.
2. `node scripts/sigma4-diverse-strong-midgame-audit.mjs`  independent legality, duplicate, position split and path geometry audit.
3. `node scripts/sigma4-diverse-strong-odd-perspectives.mjs`  correlated prior-ply board reconstruction, split inheritance.
4. `node scripts/sigma4-diverse-strong-outcomes.mjs`  full 64-game 16-start x 4-policy rollout, resumable with hashed source settings.
5. `node scripts/sigma4-diverse-strong-outcome-audit.mjs`  full-game replay and development candidate/ambiguous partition.
6. `python scripts/sigma4-diverse-strong-onnx-calibration.py`  frozen base/corrected ONNX probability and Brier calculation, by group, policy source and split.
7. `node scripts/sigma4-diverse-strong-odd-conditional.mjs`  explicitly conditional previous-mover outcome diagnostic (not independent rollouts).
8. `python scripts/sigma4-diverse-strong-odd-calibration.py`  original vs corrected ONNX comparison on forced-next-move odd snapshots.
9. `node scripts/sigma4-diverse-strong-data-readiness.mjs`  hash-stable failure/success gates for training and deployment.

All generated results, complete actions, seeds, source hashes, metrics, provisional development candidate boards and excluded ambiguity cases are in `evaluation/sigma4-diverse-*-20261106.json` / `.jsonl`.

## Recommended next experiment

To obtain a useful training set, prioritize truly contested **both turn parities** from *independent* trajectories, search for loss and reversal examples while preserving their natural policy prevalence, and introduce stronger alternative opponent families rather than nearly equivalent policies sharing one network. Before fitting a value model, validate that each source group is split entirely as development or untouched holdout, and that observed results are consistent across diverse policies. For state-value improvements, curate hard boards with long counterfactual continuations or stronger search, never call single observed game outcomes a minimax label.

**Service decision:** no code change to production root, no model weights changed, no default SIGMA4 change. The research dataset and reproducibility/audit framework are the deliverables.
