# Sigma2 continued search and replay (2026-11-02)

User requested failure recreation, root cause analysis, alternative remedies, at least 10 games, and production deployment only if strength rises.

Current production Sigma2 stays at c_puct 0.8 with 200 MCTS simulations. Sigma1 code, model, and first four opening pawn advances are unchanged.

Two additional hypotheses were tried against Sigma1 using identical seed and alternating seat across matching series: wider PUCT 0.95, or a smaller shift to PUCT 0.75, both against existing c_puct 0.8 control.

20261229 12 games: 0.8 won 8, lost 2, 2 simulation-limit cutoffs; 290 full-board position revisits. 0.95 won 8, lost 2, 2 cutoffs, 317 revisits. 0.75 won 9, lost 3, 0 cutoffs, 21 revisits.

Independent 20261221 12 games: 0.8 won 9, lost 3, 0 cutoffs, 0 revisits. 0.75 won 8, lost 3, 1 cutoff, 156 revisits.

Combined 24 paired games: 0.8 won 17 with 2 cutoffs and 290 revisits; 0.75 also won 17 with 1 cutoff and 177 revisits. 0.95 was tested in 12 games only and did not outperform 0.8. All cutoffs are unresolved, NOT draws or losses. Neither alternative met the user's primary criterion to increase Sigma2 wins robustly, so neither was applied.

The repetition traces verify that hyperparameter changes can move the engine into/out of local cycles, but are insufficient to establish their tactical root cause. Hypothesis: PUCT exploration balance interacts with loop-prone network estimates; proving individual mistakes requires deeper counterfactual continuation from the first cycle entry with both legal wall and pawn responses. Previous local anti-loop overrides were tried and could force faster losses, so automatic forced moves without game-result evidence are unsafe.

Actions completed: 36 additional new games (12 at 0.95, 12 at 0.75 for first seed, 12 at 0.75 for independent seed); 24 matched baseline games were available or rerun. All newly generated traces saved compressed and paired analysis code added. Production default remains 0.8 because no verified win-rate improvement exists in this round.

Next improvement plan: Select actual loop onset in saved 20261229 and 20261221 cutoffs; branch strongest policy and legal path-saving wall candidates at least 2-4 search depths, play complete matched continuations, and only change Sigma2 after independent win-rate and cutoff/loop verification. Preserve opening pawn moves.
