# Sigma2 visited/value-gated loop alternative evaluation

## Change
Only when a detected no-progress loop makes the originally preferred root action suspect, candidate replacement is constrained by both simulation visit count (at least 5 and 40% of leader visits) and search-estimated value (-child.q_value must be within 0.10 of the root leader estimate). If no vetted alternative exists, the original PUCT-selected root action wins. This prevents replacing a high-confidence move merely because the pawn previously occupied its destination. The existing candidate range does not change Sigma2 maximum search count of 200. Sigma1 remains unchanged.

## Exact user-file regression
The attached game (14) top-level plies 22,24,26,28,30 are replayed. Sigma2 avoids the recorded return at 26, picks another legal move at 28 and suggests c6 at 30 in independent state queries. These individual snapshots do not establish a winning full-game continuation. The direct probe is scripts/check-sigma-d7-c7.mjs.

## 20-game evaluation
Run: node scripts/tournament-sigma-selfplay.mjs --compare --games 20 --sigma2-sims 200 --exploration 0.15 --seed 20261102 --out reports/sigma-selfplay/sigma2-valueguard20.json

Results: Sigma1 9 wins, Sigma2 9 wins, 2 undecided after 200 plies. 19 distinct games, 1 duplicate. First-player wins=15 vs second-player wins=3. Sample is insufficient to prove superiority; first-player dominance is especially concerning. Two undecideds show repetition/finishing is unresolved. Full compressed game traces and aggregate summary are in evaluation/sigma2-valueguard20.json.gz and evaluation/sigma2-valueguard20-summary.json.

## Further work
Investigate strategic causes of first-player advantage and game-rule equivalence (JS game.py). Evaluate opponent best replies for replacement candidates and candidate wall quality before deploying further. Validate actual multi-turn search-tree reuse separately, and never assume increasing simulations is monotonic strength gain.
