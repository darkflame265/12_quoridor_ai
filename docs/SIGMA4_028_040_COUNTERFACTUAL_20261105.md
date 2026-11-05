# SIGMA4 028 and 040 counterfactual study (2026-11-05)

## Decision
Keep production SIGMA4 and the original ONNX network unchanged. The tested alternate moves failed to improve outcomes in paired full-game continuations. The two states are review candidates, not solved game-theoretic win/loss labels.

## Method
Reconstructed two path-balanced, development-only high-error boards independent-wall-028 and independent-wall-040. Their original neural model win probabilities for the player to move are 12.86% and 93.72%. Sigma4 MCTS at budgets 200, 400 and 800 simulations consistently chose the same leading pawn action on each board, but the neural values disagreed with prior observed outcomes.

We forced three distinct legal first actions: the leading MCTS pawn action, a different legal pawn selected by shorter route, and an alternative legal wall from the 400-simulation root candidates. Every forced action was followed by 200-simulation research SIGMA4 V3 weighted policy versus a 200-simulation native SIGMA2 or SIGMA3 opponent. Two independent seeded continuation conditions were tested per opponent (118031 and 921117). Each group of three branches shares one identical prefix, board, opponent and RNG seed, though later RNG consumption can diverge due to state differences.

Full research matrix: 2 boards x 2 opponents x 2 seeds x 3 branches = 24 completed games. Every game reached a winner without a 200-ply cutoff. Automated audit replays all actions, validates forced legal move and prefix, final winner, game hash, branch conditions and all paired outcomes.

## Results from original player-to-move perspective

| Starting state | Original MCTS choice | Alternative pawn | Alternative wall |
|---|---:|---:|---:|
| 028 | 4 wins, 0 losses | 0 wins, 4 losses | 0 wins, 4 losses |
| 040 | 2 wins, 2 losses | 2 wins, 2 losses | 0 wins, 4 losses |
| Combined | 6 wins, 2 losses | 2 wins, 6 losses | 0 wins, 8 losses |

In the 8 paired start/opponent/seed groups, 16 comparisons to the baseline yielded 0 improved wins, 10 regressions, and 6 unchanged results. Those comparisons share common reference games and are not independent statistical samples.

For 028, the very pessimistic original network value and four observed wins using the same MCTS-preferred action point to evaluation and continuation-policy uncertainty, not a need to override its selected pawn. Both alternate actions lost all four continuations. In state 040, the original pawn choice won under one seed and lost under the other, against both opponents. The alternative pawn also won and lost under the same conditions. A deterministic supervised win or loss target for 040 is unsupported.

## Artifacts
- scripts/sigma4-028-040-counterfactual.mjs: full-game resumable 24-game counterfactual runner, source-locked settings and full histories.
- scripts/sigma4-028-040-counterfactual-audit.mjs: independent legality, completion, pairing and winner verification.
- evaluation/sigma4-028-040-counterfactual-20261105.json: full research games, actions, seeds, traces.
- evaluation/sigma4-028-040-counterfactual-audit-20261105.json: paired outcomes and machine-readable rejection of promotion.

## Limitations and next gate
All branches use the same existing ONNX model and fixed candidate policy; differences in subsequent action distributions and RNG use may influence outcomes. Only two hand-selected development states were used, and the wall alternative had little MCTS support. Do not infer optimal-play truth or general engine strength. To train a new neural value model responsibly, collect more distinct strong-policy and wall-heavy outcomes with independent unseen fixtures; adjudicate ambiguity with deeper tactical verification; require independent paired wins and strict latency tests before promotion.

Promotion rejected. No model or default engine changes.
