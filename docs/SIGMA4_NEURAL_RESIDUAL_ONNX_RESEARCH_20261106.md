# SIGMA4 research neural value correction: cross-policy dataset, ONNX export and matched games (2026-11-06)

## Decision

**Research experiment completed. Production promotion REJECTED.** Probability calibration improved on two small independent validation sets, but actual paired win outcomes stayed unchanged and decision latency did not improve. Neither the original `vendor/sigma-quoridor/models/best.onnx` nor the live website SIGMA4 default was changed.

This work adds a separately trained, independently runnable **ONNX residual value head** and an opt-in research MCTS worker. It is NOT a replacement for the original board-encoded 8x9x9 network: the second model requires the first model's raw value plus six explicit geometric features.

## 64 additional full games across independent positions and policy variants

Sixteen distinct legal, wall-heavy midgame starts were selected from the previous generated 48-state bank, excluding all starts previously used for the 32-game outcome study or the 028/040 counterfactual experiment. Twelve board groups are development-only and four board groups are reserved for new evaluation.

At each board, 200-simulation research SIGMA4 was played from the original player-to-move seat in four conditions:
- V3 weighted-root Sigma4 versus native Sigma2.
- Native-root Sigma3 versus native Sigma2.
- V3 weighted-root Sigma4 versus native Sigma3.
- Native-root Sigma3 versus native Sigma3.

All 64 games reached terminal winners before ply 200 and their complete action histories were independently replay-validated. The local native Sigma2 worker already contained unrelated user worktree edits; results are therefore grounded in that exact recorded source hash, not claimed equivalent to a pristine historical Sigma2 release.

**Fifteen of 16 starting boards** yielded unanimous observed winner across four policy conditions. One evaluation-only position, independent-wall-025, produced **1 win and 3 losses**, demonstrating that a single board should not be forced into a deterministic win/loss label.

Development comprises 12 independent unanimously classified boards (48 correlated games); the evaluation-only four boards comprise 16 correlated games, including one conflicting board. Games sharing one start are NOT 64 statistically independent value-label examples. Only the 12 unanimous development boards were added as provisional training candidates. All holdout labels stayed out of training and model selection.

Cross-policy evaluation, expressed as Brier probability error per game but reported at the distinct starting-board level:
- Across 16 boards: original frozen NN 0.1541; search-400-Q 0.1126; existing Platt 0.1450.
- Development 12 boards: frozen NN 0.1868, search-400 0.1319.
- Holdout 4 boards: frozen NN 0.05608, search-400 0.05462; mixed empirical outcomes use policy-mixture expected squared error, not an arbitrarily hard binary target.

The four games for one board are correlated; policies often converge on identical moves, so even unanimous games do not prove a game-theoretic winning or losing state.

## Research neural value model training

`scripts/sigma4_value_residual_research.py` uses PyTorch CPU and a **small 6-input residual neural head**. Its inputs are the original frozen network value logit and selected side-to-move geometry (relative shortest paths, wall inventory, placed walls, and ply). The original 8x9x9 network is FROZEN. Its prediction is combined as corrected-logit = original-logit + learned-neural-residual.

Training source:
- 308 old development positions (from eight opening groups).
- 12 new unanimously observed development positions from 12 distinct starts.
- Old holdout 89 positions (three separate opening groups) and new holdout 4 positions were NOT used for model fitting or epoch selection.

A fixed model design and optimizer were run for a development-only 60-epoch group-aware selection process. The model was then fitted on all development groups for the selected 60 epochs. Group-weighted training keeps one large opening from dominating the loss. The original winning observation in a single game remains a noisy *policy-conditioned target*, not minimax truth.

Artifacts:
- `evaluation/sigma4-value-residual-research-20261106.pt`: PyTorch checkpoint.
- `evaluation/sigma4-value-residual-research-20261106.json`: training, internal development validation and external holdout metrics.
- `evaluation/sigma4-value-residual-research-20261106.onnx`: separately exported ONNX correction head.
- `evaluation/sigma4-value-residual-onnx-export-20261106.json`: schema and numerical runtime parity.
- `evaluation/sigma4-value-residual-onnx-realboards-20261106.json`: actual board-based ONNX predictions and match to research metrics.

### External holdout Brier scores (lower is better)

| Validation group | Original frozen ONNX value | Research residual ONNX value |
|---|---:|---:|
| Previous evaluation group, 89 correlated positions across 3 openings | 0.27557 | 0.18792 |
| New policy-diverse evaluation group, 4 independent boards | 0.05608 | 0.05365 |

The original development-only Platt calibration in the previous work had been 0.2319 on the old holdout. The new neural residual improves that old held-out value error but is **NOT** a demonstrated general MCTS strength gain. The four-board new holdout is too small to confirm generalization. The group-weighted original Brier is informative, but many samples still come from the same game trajectories.

### ONNX parity and inference

Exported with ONNX opset 17 to a research-only file; PyTorch and ONNX Runtime agreed with maximum absolute output difference **2.38e-7** across 40 synthetic inputs. Another independent check executed the original ONNX and separate correction ONNX on 93 real validation boards and reproduced the external Brier scores.

The standalone correction call had median ~0.035ms and p95 ~0.079ms in that limited microbenchmark, excluding original model inference, feature computation, worker initialization and MCTS. The correction is applied per MCTS leaf, so end-to-end decision latency must be tested separately.

The ONNX export dependencies were installed into the OS temporary directory, not committed to the project or installed into the production service.

## Actual MCTS integration and matched engine-strength pilot

Added `scripts/sigma4-value-residual-worker.py` as an **opt-in research copy** of the cached 200-simulation bitset wall worker. MCTS leaf evaluation uses the original ONNX's policy output unchanged, while its value output is passed through the separate learned ONNX head with state/ply features. The root's original model value is retained in diagnostics. The existing `SigmaProcess` accepts `correctedValue: true` in research only; default worker resolution is unchanged.

Worker smoke tests on states 028, 040 and 021 confirmed 200 simulations, legal decisions, unchanged original network root values, the correction ONNX operating per evaluated leaf, and valid corrected root estimates.

The match pilot uses **four training-disjoint generated holdout boards**, both candidate seats, native Sigma2 and Sigma3, with the previous SIGMA4 V3 weighted policy and 200 MCTS simulations in both baseline and corrected variants. Matched random seeds and opening history were maintained. Across 32 full games (16 matched original/corrected pairs), all moves and winners were replay-validated.

| Opponent | Frozen original model | Research corrected model |
|---|---:|---:|
| Native Sigma2 | 4 wins / 4 losses | 4 wins / 4 losses |
| Native Sigma3 | 4 wins / 4 losses | 4 wins / 4 losses |
| Total | **8 wins / 8 losses** | **8 wins / 8 losses** |

Thirteen of the 16 paired games followed different full move sequences, but **zero changed a paired win into a loss or a loss into a win**. Thus calibration improvement did **not** translate to demonstrated strength improvement.

Warm candidate decision time (this excludes startup and server overhead):

| Metric | Original | Corrected |
|---|---:|---:|
| Candidate moves | 247 | 247 |
| Mean | 172.7ms | 188.1ms |
| p95 | 366.0ms | 378.8ms |
| p99 | 527.7ms | 498.9ms |
| Over 500ms | 3 | 2 |

Mean and p95 worsened. Neither variant strictly satisfies a guaranteed 500ms limit. These timings are from related games, fixed variant order, and local machine scheduling, not an independent randomized performance certification.

## Reproduction and audit gates

- `node scripts/sigma4-crosspolicy-independent.mjs`: reproducible/resumable 64 completed cross-policy games.
- `node scripts/sigma4-crosspolicy-audit.mjs`: replay, source grouping, contradiction detection, development-only label outputs.
- `python scripts/sigma4_value_residual_research.py`: group-aware PyTorch research training, checkpoint and probability diagnostics.
- `python scripts/sigma4_value_residual_export.py`: ONNX export (requires onnx/ml_dtypes only in a research environment), PyTorch/ONNX parity test.
- `python scripts/sigma4_value_residual_runtime_verify.py`: independent real-board original+correction ONNX inference and Brier checks; only standard ONNX Runtime needed.
- `node scripts/test_sigma4_value_corrected_worker.mjs`: 200-simulation original/corrected worker smoke check.
- `node scripts/sigma4-value-onnx-matched-pilot.mjs`: resumable 32-game matched SIGMA2/3 pilot.
- `node scripts/sigma4-value-onnx-matched-audit.mjs`: full game replay and paired win/latency verification.
- `node scripts/sigma4-residual-evaluation-acceptance.mjs`: integrity and promotion rejection gate, including model hashes and split checks.

### Promotion gate: FAIL

Reason: only four training-disjoint independent starting boards in the strength pilot, no matched win improvement, a non-drop-in correction interface, uncertain noisy policy-conditioned labels and no strict 500ms guarantee. Keep both the original `best.onnx` and production SIGMA4 default unchanged. The new correction ONNX is retained strictly as a research artifact, with an optional research worker for further evaluation.

Next needed: many independently sampled balanced midgames generated from *strong* selfplay rather than wall-biased synthetic moves, multiple independent opponents/seeds, and blinded matched tournaments. Only modify production after a convincing, statistically supported strength and latency result.
