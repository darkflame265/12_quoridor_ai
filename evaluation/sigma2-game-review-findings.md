# Sigma2 game-by-game decision review

Source: 20-game complete selfplay trace, not just win/loss summary.

Method: examine every Sigma2 decision and candidate action, compare the worst single legal opponent reply under wall-aware shortest-path race metric. This is a one-reply geometric proxy, not proof of optimal play.

775 Sigma2 decisions examined; 242 flagged for further review, including 47 flagged turns in games won by Sigma1.

In fifth game (index 4), Sigma2 repeated move (5,3) on plies 35, 39, 43 and 47. The selected pawn move had 21 MCTS visits, worst-reply race metric +1. Alternative horizontal wall (2,4) had 17 visits and worst-reply metric -6 (lower is better for moving side). This is a promising counterfactual but NOT proof that the wall wins.

Do not force this alternative solely from the one-reply heuristic. Next validate deeper search, wall legality across future moves, and performance with paired side swaps before choosing a new engine policy.

Reproduce: node scripts/analyze-sigma-decisions.mjs reports/sigma-selfplay/sigma2-valueguard20.json evaluation/sigma2-decision-review.json
