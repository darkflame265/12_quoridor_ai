# Sigma2 first-player and opening review

Source: 20 full recorded games in reports/sigma-selfplay/sigma2-reviewed-policy20.json. Reproduce via scripts/sigma-side-opening-review.mjs.

Sigma2 first: 8 wins, 2 losses. Sigma2 second: 2 wins, 8 losses. First player across variants 16 wins, second player 4. Aggregate Sigma1/Sigma2 wins 10 each.

All twenty games shared the same first four pawn moves: (4,7), (4,1), (4,6), (4,2). First wall appeared at ply 7. Opening diversity was negligible although full-game traces varied.

Game index 2: Sigma2 moved first but lost after 136 plies; repeated-pawn-move heuristic triggered 66 times, own previously visited squares appeared 49 times. These are diagnostic counts, NOT a formal repetition rule.

Conclusion: first-move initiative, identical openings, and true engine strength cannot be disentangled from these matches. Equal win count does not establish equal playing strength.

Rejected code change: filtering historical progress comparisons by identical wall layouts reintroduced d7/c7 return at ply 26. It was reverted and is not shipped.

Next: construct paired legal opening prefixes with explicit side swaps and deterministic independent seeds. Compare the same opening families under each engine and analyze losing-game tactical turns with actual continuation workers before imposing forced alternatives.
