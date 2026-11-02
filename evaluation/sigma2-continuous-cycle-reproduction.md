# Continuous reproduction of 136-ply wall-triggered Sigma2 cycle

Starting position: exact saved game index 2 position **after move 22** from `reports/sigma-selfplay/sigma2-reviewed-policy20.json`. Prefix history preserved. Both engines run actual moves for up to 80 additional plies, with original side assignment and swapped assignment, identical seed 20261114, Sigma2 200 PUCT simulations, exploration 0. Initial four forward moves unchanged.

## Control (precommit disabled)
- Sigma2 first (game 0): 80 additional moves without winner; 75 revisits of full board positions; pawn oscillation appeared immediately: Sigma2 (4,3) -> (4,4) -> (4,3), opponent (5,3) -> (6,3) -> (5,3).
- Sigma2 second (game 1): side 0 won after 29 future moves, zero repeated full positions.

## Proposed correction under test (precommit enabled)
- Sigma2 first (game 0): Sigma2 lost to side 1 after 50 future moves; zero repeated full board positions. The intervention triggered once on ply 25: rejected moving to (6,3), chose vertical wall at (2,4). The following actual game ultimately lost.
- Sigma2 second (game 1): same side-0 win in 29 moves, no overrides.

## Decision
The old engine's cycle failure is now reproduced in a continuous rollout, and the proposed retreat guard DOES change the trajectory but does NOT improve the outcome. Do not turn it on by default. It remains `SIGMA2_PRECOMMIT_RETREAT=1` opt-in. This test specifically falsifies the claim that penalizing local path regression is sufficient for stronger play. The root issue is that the search can prefer repeated positions even with winning path advantage; fixing it likely requires correcting MCTS cycle utility and considering wall dynamics beyond local path distance, then paired continuation testing.

Outputs: `evaluation/sigma2-midgame-paired-results.json` and compressed full traces. Re-run from saved fixture using `scripts/sigma-midgame-branch.mjs`; inspect using `scripts/analyze-sigma-midgame-pairs.mjs`. These 80-move caps are NOT official draws.
