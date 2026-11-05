# SIGMA4 tactical research: SIGMA3 loss diagnosis, V7 tempo guard and V8 verified reply
Date: 2026-11-05

## Decision
Do **not** promote V7 or V8 or modify the web-default SIGMA4. Neither new tactic improved win rate in the controlled holdout. Retain existing live behavior and the prior V3 immediate-goal safety policy as the research baseline.

## Diagnosed SIGMA3 losses
Two completed losses from the optimized 200-simulation Sigma4 weighted candidate:
- NW opening, candidate seat 0: lost after 80 plies. In the late game its pawn path was 10+ steps longer than the opponent's; a wall at ply 40 increased its own shortest path by 2 while increasing the opponent's by only 1. After both sides exhausted walls, it sometimes moved backward instead of progressing. Late pawn moves did not rescue the game.
- SE opening, candidate seat 1: lost after 63 plies. At plies 53 and 55 it placed walls that neither increased opponent shortest path nor decreased its own shortest path, despite trailing in distance by 7-8 steps. These are apparent tempo losses, but the recording alone does not prove that an alternative move would have won.

These are observations from a **losing trajectory**, not causal counterfactual proofs.

## V7 heuristic
Research module sigma4-tempo-guard-v7.mjs runs the V3 one-move immediate-goal guard and, when badly behind and a weighted wall is not clearly helpful, substitutes a safe pawn move that improves its own shortest route.

Unit test replay of the historical loss positions at plies 53 and 55 selected legal pawn moves instead of no-impact walls.

On **two previously evaluated** opening fixtures against native Sigma3: the V7 composite policy scored **3W/1L**, but the original weighted policy scored **2W/2L** and differs in TWO ways: V7 includes V3's immediate-goal guard and the new tempo rule. Crucially, V7's tempo replacement was used only in one game, which was lost faster (54 plies versus 80). The extra win in the other losing position **cannot be attributed to V7 tempo logic** because the tempo intervention did not occur there.

## Controlled holdout versus Sigma3
Two additional independent legal six-ply opening fixtures, each seat; full games with 200 MCTS simulations. Compare V3 (same immediate-goal safety baseline) versus V7 and V8.

| Policy | Wins | Losses | Intervention result |
|---|---:|---:|---|
| V3 existing immediate-goal guard | 2 | 2 | baseline |
| V7 with tempo wall heuristic | 2 | 2 | 1 game changed; that loss was shortened from 94 to 64 plies |
| V8 with verified two-turn opponent goal check | 2 | 2 | **No proof escape triggered**; all four full game move hashes identical to V3 |

This is a small holdout and cannot prove general win rate, but it **does not support** V7 or V8 promotion.

## V8 tactic
The research-only module sigma4-verified-two-turn-v8.mjs checks a narrow opponent two-turn pawn-goal sequence only when opponent shortest route is at most two steps. For each candidate action, it checks opponent's legal pawn attacks, then *all* available legal pawn and wall replies, then whether the opponent can win immediately. If it finds a forced opponent win, it tries searched alternatives and legal pawn moves. A switch occurs only when the specific forced two-turn line does not exist for the alternative. It preserves the V3 one-move safety wrapper.

This is **not** a complete solution for Quoridor: opponent might win through a wall move or longer tactical sequence; searching only for this specific forced pawn goal is deliberately incomplete. It is computationally expensive near the finish with many legal defensive walls and has no deadline guarantee. Synthetic terminal, forced two-turn goal and short-range pruning tests passed, but no full-game improvement was observed.

## Files
- scripts/sigma4-sigma3-loss-trajectory-audit.mjs / evaluation/sigma4-sigma3-loss-trajectory-audit-20261105.json
- scripts/sigma4-tempo-guard-v7.mjs / scripts/test_sigma4_tempo_v7.mjs
- scripts/sigma4-tempo-v7-vs-sigma3.mjs / evaluation/sigma4-tempo-v7-vs-sigma3-20261105.json
- scripts/sigma4-v3-v7-holdout.mjs / evaluation/sigma4-v3-v7-holdout-20261105.json
- scripts/sigma4-verified-two-turn-v8.mjs / scripts/test_sigma4_verified_two_turn_v8.mjs
- scripts/sigma4-v8-holdout-vs-sigma3.mjs / evaluation/sigma4-v8-holdout-vs-sigma3-20261105.json
- scripts/sigma4-tactical-v7-v8-audit.mjs / evaluation/sigma4-tactical-v7-v8-promotion-audit-20261105.json

## Next meaningful work
V7's performance is not robust and V8 is too narrow to help the recorded midgame losses. Stronger work requires **counterfactual rollouts at the early wall decisions** (e.g., NW ply 24/40, SE ply 53/55) with both players searching from the changed move, not merely scoring the original fixed trajectory. Cross-check with untouched starting positions against SIGMA2, SIGMA3 and original weighted SIGMA4, both seats. Develop tactical search with bounded time and clear fallback; never claim guaranteed or absolute win rates. Any policy must improve a sufficiently large blind paired match before replacing the default.
