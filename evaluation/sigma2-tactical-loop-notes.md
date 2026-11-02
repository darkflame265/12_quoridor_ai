# Sigma2 bounded endgame tactical proof and anti-stall search

## Changes
- Sigma2-only pawn endgame forced-winning line search when BOTH wall supplies are zero. Bounded at 10 plies, 16000 search nodes with memoization and cycle-as-unproven handling. A proven root forced win overrides the root's stochastic PUCT choice. If no proof or budget exceeded, original candidate selection remains.
- MCTS-internal repetition: when the current root player leads the opponent by at least two wall-aware shortest-path steps, a repeated simulation position is scored as -0.45 from root perspective rather than neutral 0. Otherwise loop score stays neutral to preserve defensive repetitions.
- Original ONNX model and Sigma1 unchanged. Sigma2 still performs up to 200 PUCT simulations per decision; exact endgame tactical search is an extra bounded verification step, not included in the PUCT simulation count.

## Limits
- No forced-win proof with walls remaining: both previous 200-ply cutoff selfplay positions still had wall inventory (9 total and 2 total respectively). Those particular failures are NOT guaranteed fixed.
- Root MCTS built-in Python library carries its own draw conventions, which differ from the JS game; not changed in the upstream vendored engine.
- Do not treat four test games as evidence of superiority. Need >=20 hold-out games, multi-ply tactics including defense walls, and robustness timing under game-time constraints.
- Ongoing web launcher process was not restarted.

## Tests
Direct uploaded d7-c7 replay script: scripts/check-sigma-d7-c7.mjs
Direct near-goal wall-free start: Sigma2 correctly selected a one-move goal under its 200 simulation cap.
Four-game comparison data: evaluation/sigma2-tactical-loop4-summary.json and archived full traces.
