# Sigma 2: deeper PUCT rather than tactical postprocessing

Sigma 1 is frozen: original ONNX `vendor/sigma-quoridor/models/best.onnx`, PUCT 50, public browser engine `sigma` unchanged.

Sigma 2 now uses the same ONNX model and upstream PUCT search, with default 200 simulations controlled by `SIGMA2_SIMS`. Earlier heuristic wall, loop and emergency goal postprocessing is removed from the Sigma 2 branch. Sigma 2 remains experimental and must explicitly set `SIGMA_VARIANT=sigma2`. PUCT c_puct remains 1.2.

A persistent MCTSAgent with the upstream two-ply subtree matching is opt-in via `SIGMA2_REUSE=1`. It is disabled by default because the game-state integration and transposition handling have not been thoroughly regression-tested in longer multi-turn sessions. This does not replace the baseline Sigma 1 agent.

## Single midgame position benchmark (uploaded user-loss replay before ply 19)
Measured worker inference wall time; includes PUCT and model execution but excludes worker process startup:
- Sigma 1 50 simulations: 230.4 ms, pawn to (1,5).
- Sigma 2 200: 572.1 ms, wall (4,5,h).
- Sigma 2 400: 1026.0 ms, same wall.
- Sigma 2 800: 2931.8 ms, same wall.
- Sigma 2 200, reuse option enabled on *first* move: 648.1 ms. This does NOT measure benefit of reusing a prior subtree. Benchmarks are one sample, not an average or an actual win-probability comparison.

## Opening head-to-head
Two Sigma1(50) vs Sigma2(200) games with no stochastic exploration: one 200-ply undecided, one completed at ply 51. This is insufficient to prove Sigma2 is stronger. Full traces stored compressed separately.

## Next requirements
1. Multi-turn deterministic benchmark for actual subtree reuse with no illegal actions and exact state consistency; compare paired positions with reuse on/off.
2. Diversify opponent policies while keeping the exact fixed centered initial position; count unique game hashes, wins and undecided games.
3. Run 200 and 400 simulations head-to-head against Sigma1 and the user-loss pivotal positions. Use 800 if gains justify ~3 sec per move.
4. Promote Sigma2 only after independent evaluation and no tactical regression.
