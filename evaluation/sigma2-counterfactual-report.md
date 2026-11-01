# Sigma 2: user-loss counterfactual and tactical response

Scope: only the 41-action main segment of the uploaded user-game file. The last position was nonterminal (opponent one move from goal). Never infer the actual losing move from missing data.

## Candidate moves after five suspicious walls
At plies 7, 9, and 11, replay showed a legal pawn advance to (4,4) with a one-step-shorter own shortest-path than the originally played wall, while the enemy path length remained unchanged on that same ply. The wall preserved long-term option value, so this is **not** proof it was strategically inferior.

At plies 15 and 27, the best listed pawn alternative did not shorten the immediate shortest path relative to the original wall. The immediate wall-impact heuristic is therefore **insufficient** to determine the optimal choice at all five points.

Counterfactual report: evaluation/sigma-userloss-counterfactual.json. It checks legal alternatives and a single opponent geometric reply; it is **not** a game-tree proof, nor a measured win-probability improvement.

## Sigma 2 experiment
Sigma 2 (not Sigma 1) now checks an immediate goal and a basic one-move opponent goal threat, and can choose a visited legal blocking wall in that threat case. It retains earlier wall-efficiency checks. These are tactical **prototypes**, not a complete proof against jump or complex pawn contact.

Four standard-opening comparison games, alternating sides with no exploration, ended Sigma 1: 2 wins, Sigma 2: 2 wins. Only two distinct games were observed. Sigma 2 is **not promoted**. Keep the public Sigma 1 worker and original best.onnx unchanged.

## Next checks
- For each of the five pivots, play continuation branches against multiple varied opponent strategies, including wall-preparation value and race threats.
- Add a fully authoritative immediate-threat checker based on src/engine.js, including jumping/contact, rather than only vertical goal steps in the prototype.
- Evaluate Sigma 1 vs Sigma 2 on unseen opponent seeds, balanced sides, and Atlas regressions. The same fixed starting state is retained.
