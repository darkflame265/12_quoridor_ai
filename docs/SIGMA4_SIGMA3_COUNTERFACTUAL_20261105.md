# SIGMA4 versus SIGMA3: counterfactual continuation study
Date: 2026-11-05. Result: **No winning improvement demonstrated. Keep existing website default and existing research policy.**

## Question and method
We analyzed two prior completed SIGMA4 (200 MCTS simulations with Sigma3 model, root weighted stochastic policy, ONNX cache and bitset wall legality) losses to native Sigma3. Rather than crediting a locally better shortest-path distance, we replayed the exact recorded prefix to a decision point, forced either the recorded move or one legal counterfactual alternative, and then had both engines compute fresh moves until an actual win or 200-ply cutoff.

Both branches for each test use the same starting board, prefix, assigned candidate side, fixed opponent implementation (native Sigma3 200 simulations), simulation budget and freshly initialized candidate RNG seed. The only controlled first decision is the alternative move. Different later states necessarily lead to different search trees and potentially different usage of the RNG stream. A branch baseline need not match the *historical* game continuation because its RNG restarts. We explicitly use that new baseline to make the comparison fair.

Source: evaluation/sigma4-bitset200-vs-sigma23-20261105.json. Research code captures full legal game actions, final winners, actions hash, candidate/opponent moves, timing, seed, and source hashes. An independent audit replays each full game and verifies all move legality, branch prefix identity, and final winner.

## Late decisions and path-progress alternatives
One paired rollout per position, both branches played to completion.

| Prior loss | Branch ply | Recorded action | Alternative | Recorded-branch result | Alternative-branch result |
|---|---:|---|---|---|---|
| NW seat 0 | 24 | vertical wall (2,3) | pawn move (6,8) | loss, total 50 plies | loss, total 50 plies |
| NW seat 0 | 40 | horizontal wall (6,5) | pawn move (7,8) | loss, total 72 plies | loss, total 46 plies |
| SE seat 1 | 53 | horizontal wall (5,3) | pawn move (7,0) | loss, total 61 plies | loss, total 61 plies |
| SE seat 1 | 55 | vertical wall (0,7) | pawn move (7,0) | loss, total 63 plies | loss, total 63 plies |

The NW ply-40 wall increases own shortest path from 14 to 16, but the pawn alternative shortens it to 13 and nevertheless loses five moves after branching. This is a clear example that **immediate shortest-path progress cannot be interpreted as a winning tactic**. Opponent blocking and long-term wall geometry matter.

Root MCTS search at ply 40 strongly prefers the recorded wall: 149 visits and root Q approximately -0.059, versus the pawn step: 40 visits and root Q approximately -0.932 (from the same search). At SE plies 53/55 the preferred root Q is near -1, suggesting these positions may already be deeply unfavorable; this does not prove forced loss.

## Earlier MCTS-explored alternatives, two continuation seeds
On earlier positions from the same losses, we selected a different **visited MCTS root candidate**, not a hand-written pawn heuristic:
- NW ply 10: recorded horizontal wall (3,6), alternative vertical wall (2,7) with 45 visits (versus 112 for the recorded wall).
- SE ply 17: recorded pawn move (6,2), alternative horizontal wall (2,5) with 90 visits (versus 68 for the recorded move).

Two independent continuation seeds each, two branches each:

| Position | Seed 117011 recorded/alternative | Seed 917233 recorded/alternative |
|---|---|---|
| NW ply 10 | WIN / LOSS | WIN / LOSS |
| SE ply 17 | LOSS / LOSS | LOSS / LOSS |

The NW alternative had negative win impact in both tested seeds, while the SE alternative never changed defeat into victory.

## Summary
- **16 completed games = 8 paired counterfactual comparisons.**
- Alternative increases final wins: **0/8 pairs**.
- Alternative converts a win into a loss: **2/8 pairs**.
- Same win/loss outcome: **6/8 pairs**.
- All moves were revalidated via the project's JavaScript rules; no game cut off.
- These pairs are heavily correlated across only two original game trajectories, and are not a statistically independent general win-rate tournament.

## Research code and evidence
- scripts/sigma4-sigma3-counterfactual-rollouts.mjs: late branch 24/40/53/55 continuation runner
- scripts/sigma4-sigma3-counterfactual-root-audit.mjs: MCTS root Q/visits at four late decisions
- scripts/sigma4-sigma3-early-root-options.mjs: root-Q and visited alternative decisions at early plies
- scripts/sigma4-sigma3-counterfactual-early.mjs: early branch runner, first seed
- scripts/sigma4-sigma3-counterfactual-early-seed2.mjs: replicated early branch runner, second seed
- scripts/sigma4-sigma3-counterfactual-verdict.mjs: full legality/replay/pair verification and no-promotion gate
- Corresponding evaluation/sigma4-sigma3-counterfactual-*.json artifacts preserve the output and full actions.

## Engineering decision and next research
**No new heuristic was deployed, and the site default SIGMA4 was not changed.** Neither shortest-path-based substitutions nor alternate visited root choices improved the final outcome in this controlled sample. The loss trajectory is a poor place to infer general moves without counterfactual continuations.

The next useful step is collecting a much broader, fully independent game pool and analyzing positions *before* the value becomes consistently negative. Test time-bounded opponent reply evaluation on identified high-risk branches, using separate seeds and large unseen paired matches. Favor demonstrably improved outcomes over ever more single-position tuning. A stronger engine cannot guarantee wins against all users or all opponent policies.
