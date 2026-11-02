# Sigma2 strength improvement: paired full-game verification

## Problem reproduction / corrected attribution
- Original 136-ply match index 2 in `sigma2-reviewed-policy20.json`: tournament worker mapping is `workerIndex=(side+gameIndex)%2`; worker 0 is Sigma1, worker 1 Sigma2. Thus in EVEN games Sigma1 is side 0 and Sigma2 is side 1. The old midgame replay experiment mislabeled the repeating player as Sigma2. The corrected replay with Sigma2 as side 0 from the exact state after move 22 ended in a side-0 win after 29 additional plies. The old 80-ply/75-repeat loop describes the Sigma1-side-0 setup, not proof of a Sigma2 loss.
- Repetition remains a genuine failure mode for both engines: in the improved holdout game index 2 (Sigma2 side 1), 200 plies ended without a goal, with 126 full-position revisits. This is a simulation cutoff, never an official draw.

## Diagnosis and selection of fix
- Previous Sigma2 candidate sampling may help escape policy concentration: removing it was harmful (7 Sigma2 wins / 11 Sigma1 wins / 2 cutoffs in 20 games on seed 20261114), so it remains enabled by default.
- Changing the root PUCT exploration coefficient while preserving 200 search simulations proved more effective than forcing local wall/retreat rules. The chosen policy uses `c_puct=0.8` for Sigma2 (previously 1.2). Sigma1 remains 1.2. The custom Sigma2 cycle-aware search and terminal tactical safeguards remain in place. No changes to opening first four forward moves.
- Lower c_puct emphasizes exploitation of already evaluated good moves versus exploring uncertain high-prior alternatives. This is a plausible explanation, not a proof about individual errors. Full game traces and matched-game first-divergence report are retained for inspection.

## Paired evaluation (same seed, alternated sides, 200 MCTS simulations for Sigma2)
- Seed 20261114 (20): Sigma2 previous 10 wins, Sigma1 10 wins, zero cutoffs. Sigma2 c_puct 0.8: 15 wins, Sigma1 5 wins, zero cutoffs, 20 unique trajectories. 6 games improved from non-win to win; 1 game changed from win to non-win.
- Unseen holdout seed 20261201 (12): previous Sigma2 6 wins, Sigma1 5 wins, 1 cutoff. Sigma2 c_puct 0.8: Sigma2 11 wins, Sigma1 0 wins, 1 cutoff. 5 games improved to wins, none flipped from win to non-win.
- Across 32 paired games: previous Sigma2 16 wins, changed Sigma2 26 wins. Win rate including cutoffs as nonwins 50.0% -> 81.25%. Two settings were evaluated, so results can still overstate broader generalization; do not claim universal strength superiority.

## Changed default, safety and regression
- `SIGMA2_CPUCT` now defaults to 0.8 and can be tuned by environment. The tournament CLI accepts `--sigma2-cpuct`; reports record exact c_puct and ensure it matches on resume. `SIGMA2_DETERMINISTIC` stays off by default. Older one-reply, strict cycle and precommit experiments remain opt-in and are NOT enabled by default.
- Kept Sigma2 200-simulation cap, Sigma1 inference unchanged. Existing regression tests and frontend build pass; the live web server was not restarted.

## Remaining root-cause work
- New holdout cutoff index 2 still has 126 repeated board states with scorelessly circling. Further safeguards need real played-game wall and pawn continuation comparisons, rather than hard anti-loop bans which previously led to prompt losses. Target the saved cutoff as a second continuous game replay and verify both survival and progress, not just fewer repeated states.
- Evaluate 20+ additional independent seeds before claiming a stable large performance gain; maintain per-side and cutoff measurements.

## Reproduce
- `node scripts/analyze-sigma-cpuct-pairs.mjs`
- `node scripts/tournament-sigma-selfplay.mjs --compare --games 20 --sigma2-sims 200 --exploration 0.15 --seed 20261114 --sigma2-cpuct 0.8 --out reports/sigma-selfplay/sigma2-cpuct08-20.json`
- `node scripts/tournament-sigma-selfplay.mjs --compare --games 12 --sigma2-sims 200 --exploration 0.15 --seed 20261201 --sigma2-cpuct 0.8 --out reports/sigma-selfplay/sigma2-cpuct08-holdout12.json`
