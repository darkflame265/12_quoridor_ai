# SIGMA4 ONNX value-head evaluation (2026-11-05)

## Verdict
Keep the existing ONNX weights and web-default SIGMA4 unchanged. The current evidence does not justify retraining or promoting a calibrated model. Evaluation and dataset construction are complete.

## Source and leakage protection
Existing 80 completed SIGMA4/SIGMA2/SIGMA3 games came from three tracked evidence files (V10: 48 games, V9: 24 games, cached200 vs Sigma2/3: 8 games). All game actions were replayed and legal moves and final winners verified.

These games represent 11 distinct opening prefixes, not 80 statistically independent starting situations. Sampled 960 ply positions. Found 539 repeated position occurrences and 65 conflicting observed-outcome occurrences (24 distinct positions). Excluded all 24 ambiguous positions, deduplicated the remaining boards and partitioned by the complete opening prefix SHA-256 to avoid leakage:
- 308 development positions from eight opening groups.
- 89 untouched holdout positions from three opening groups.
- All 397 positions are unique and disjoint across splits.

The label is the observed eventual game winner from the perspective of the player to move. It is NOT a forced win/loss or minimax target. Repeated games and adjacent plies are dependent. The dataset is not yet high-quality training ground truth.

## Value-head calibration
The original frozen network outputs a value in [-1,1], mapped to win probability as (value+1)/2. The model hash is d790dac68389f7602ff8a887a2385417d3c925fe22da7164c86e9226f943908d.

| Metric | Development 308 | Holdout 89 |
|---|---:|---:|
| Observed win rate for side to move | 32.79% | 26.97% |
| Mean predicted win rate | 35.96% | 45.57% |
| Brier loss (lower better) | 0.0832 | 0.2756 |
| Log loss | 0.2930 | 0.8107 |
| 0.5 threshold accuracy | 90.26% | 59.55% |
| 5-bin ECE | 0.0699 | 0.2755 |

The holdout is poorly calibrated, especially at early/midgame stages. Only three holdout opening groups mean uncertainty is high. The strong development/holdout gap may reflect differences in those openings, correlated outcomes, and policy/strategy rather than only a flawed neural model.

A constant probability equal to the development observed win rate (32.79%) achieves holdout Brier 0.2003 and log loss 0.5909, better than the unchanged network on these 89 positions. This is a diagnostic probability baseline, not a playing strength comparison.

## Research-only probability correction
Fitted an L2-regularized affine transformation of the network win-probability logit using development labels ONLY. Scale 0.75853, bias -0.27543, L2 penalty 0.05.
- Development Brier 0.0832 -> 0.0797.
- Holdout Brier 0.2756 -> 0.2319.
- Holdout log loss 0.8107 -> 0.6523.
- Holdout threshold accuracy unchanged at 59.55%.

Even after correction, holdout Brier 0.2319 is worse than the simple constant 0.2003 baseline. The prototype is not integrated into MCTS and has no independent match strength evidence.

## Training-data candidates and next gate
17 high-error **development-only** positions were saved including full board states and provenance. They are review targets, not trusted win/loss labels. Incorrect moves after a board state can cause a losing outcome from a perfectly winnable position.

To train a new value network credibly, gather a much broader blind game pool with hundreds of independent opening/midgame wall configurations and diverse strong opponent policies; avoid repeated fixtures, adjudicate selected mistakes with deep tactical search or reliable search labels, and keep a final holdout untouched. Only promote a model after calibration, full-match paired wins, and p95/p99 latency gates all pass.

## Reproduce
- scripts/sigma4-value-dataset.mjs: replay source games, deduplicate, exclude contradictions, split by opening prefix.
- scripts/sigma4_value_calibration.py: run the existing ONNX value head on each board, compute probability metrics by stage and fixture.
- scripts/sigma4_value_calibrator_prototype.py: train development-only probability correction (does not change the ONNX).
- scripts/sigma4-value-audit.mjs: verify model hash, no leakage, dataset and research-only decisions.
- evaluation/sigma4-value-dataset-manifest-20261105.json: fixture groups, splits and duplicates.
- evaluation/sigma4-value-development-positions-20261105.jsonl and evaluation/sigma4-value-holdout-positions-20261105.jsonl: replayable positions.
- evaluation/sigma4-value-scored-20261105.jsonl: predictions.
- evaluation/sigma4-value-hard-examples-development-20261105.jsonl: 17 high-error boards.
- evaluation/sigma4-value-calibration-20261105.json, sigma4-value-calibrator-prototype-20261105.json, and sigma4-value-audit-20261105.json: results.

PROMOTION: REJECTED. Neither the website default nor best.onnx was changed.
