# Sigma 2 ? 200 simulation cap and 20-game repeatability study

- Sigma 2 PUCT search simulations are now validated to be 1?200 in both the Python worker and tournament CLI. The default remains 200. Sigma 1 stays at 50 and the website still uses Sigma 1.
- 20 standard-opening matched games, alternating Sigma 1/2 sides, exploration=0, seed=20261101, tree reuse disabled: Sigma 2 wins 10, Sigma 1 wins 0, and 10 end at the 200-ply limit.
- **Only 2 distinct complete game hashes.** The first two game trajectories were evaluated by the actual agents; after that deterministic identical board/variant positions were memoized for speed. They are **NOT 20 independent demonstrations of strength**. Deterministic cache replay accounts for 2259 moves. Repeatable results are one win and one undecided from two distinct side arrangements.
- In the undecided 200-ply game, 174 visited full-board positions were repeats. Mean Sigma worker elapsed time on first uncached 200-ply game across both sides was ~745 ms; on 51-ply game ~642 ms. These are not isolated Sigma 2 latency measurements.
- Do not promote Sigma 2 or conclude a 100% win rate. Future strength estimates require opponent diversity (seeded alternative moves during development), duplicate-aware reports, true held-out evaluation, and careful loop/forced-goal tactical follow-up without replacing good PUCT moves blindly.
- Test multi-turn subtree reuse carefully before enabling it in Sigma 2. It remains an opt-in experiment and Sigma 1 stays unchanged.
