# Sigma2 root candidate filtering improvement

## Diagnosed mechanism
Sigma2 applies post-search sampling over root MCTS moves with a visit threshold of 72% of top root visits. Fully deterministic selection previously degraded performance, so removing stochasticity entirely was not sensible. Hypothesis: narrowing the set of plausibly strong actions while keeping choice stochastic can reduce weaker moves and recurring positions. This is a hypothesis; the neural network itself is not proven faulty.

## Intervention
`SIGMA2_CLOSE_RATIO` now defaults to 0.88 instead of 0.72. This only changes Sigma2's close candidate pool, not Sigma1, first four opening moves, neural model, PUCT constant 0.8, or 200-simulation cap. It can be overridden through the environment or the tournament CLI.

## Matched paired 12-game trials
Seed 20270109: baseline 0.72 Sigma2 6W 6L 0 cutoff, 14 full-board revisits, 9 distinct trajectories; candidate 0.88 Sigma2 9W 3L 0 cutoff, 0 revisits, 10 distinct trajectories.
Seed 20270119 (held out): baseline 0.72 Sigma2 10W 1L 1 cutoff, 130 revisits; candidate 0.88 Sigma2 9W 3L 0 cutoff, 0 revisits.
Combined: baseline Sigma2 16 wins, 7 losses, 1 unresolved 200-ply simulation cutoff, 144 exact-position revisits; candidate 18 wins, 6 losses, 0 cutoffs, 0 revisits. Cutoffs are not draws. 24 games per arm, same seeds and alternating seats, 48 total games.

## Acceptance and limits
This change increased wins by 2/24 and eliminated repeated board positions in these samples. Not proof of universally higher win rate or complete loop elimination. More independent seed sets and specific midgame wall response fixtures will improve confidence. Current policy leaves defensive retreats legal and does not impose hard move bans.

## Operational
Tests: node 9 tests passed, Python compilation and Vite build passed. No change to running server at port 12324; live process needs restart to read updated worker default.
