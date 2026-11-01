# Sigma2 internal MCTS path-repetition treatment

The Sigma2-only subclass of the upstream MCTSAgent detects repeated full position keys while walking an individual simulated root-to-leaf path. An internally repeated position yields a draw value of zero, which is backed up through the usual PUCT statistics. This is different from overriding only the final move; however, **real-game repetition from earlier searches is not yet integrated into the initial MCTS root history**. The recent real-game full-state screening and near-top visit-count stochasticity remain enabled.

Sigma1 uses unchanged upstream MCTSAgent with 50 simulations. Sigma2 uses at most 200 per turn, original ONNX, no retraining. Multi-turn tree reuse remains opt-in and requires deeper validation before promotion.

4 deterministic-opening test games: Sigma2 2 wins, Sigma1 2 wins, no undecided, only 2 unique game hashes.
4 seeded exploration test games: Sigma2 and Sigma1 win/loss figures are in evaluation/sigma2-loopaware-diverse4-summary.json; 4 unique games, no 200-ply undecided.
The sample is too small for a strength claim. The fact that all eight games ended is encouraging but not proof that loops are eliminated. Future work: integrate external match history into root search, verify subtree reuse correctness, compare 20 varied games with held-out seeds, and test game rule agreement with JS engine for captures/contact, jumps, walls.
