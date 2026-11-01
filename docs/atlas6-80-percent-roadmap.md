# Atlas 6: 80% win-rate development gate

## Verified external engines (2026-11-01)

- [gorisanson/quoridor-ai](https://github.com/gorisanson/quoridor-ai): MIT license. Browser JS (`src/js/game.js`, `ai.js`, `worker.js`); MCTS with heuristic rollouts, shortest-path guidance and selective wall candidates. Source downloaded separately to untracked `.external/quoridor-research/quoridor-ai-main`. This is NOT yet an executable opponent under the Rust/native tournament protocol.
- [bartolomeo3000/SigmaQuoridor](https://github.com/bartolomeo3000/SigmaQuoridor): MIT license. Trained policy/value network, optional PUCT MCTS, ONNX browser evaluation. Local archive download attempted but timed out; no model installed or inference validated. The author's external benchmark results do NOT imply performance versus Atlas 5.3.

## Non-negotiable comparison

1. Freeze the actual Atlas5.3 binary SHA256 and `profile=candidate` (2); never call `baseline` Atlas5.3.
2. Preserve 500ms / four cores, valid Quoridor rules, identical 15 fixed openings/seat assignment for rapid screening. Report W/L/undecided and rate. Existing unmodified baseline: 7W/8L = 46.7%, fixtures 085-092, under 15-game schedule. An unchanged baseline is NOT an improved engine.
3. 15-game screening is too noisy to establish 80%: 12/15 is only a preliminary target. Final promotion requires >=200 independent, previously unseen, balanced matches and a stated uncertainty bound.
4. Never add external source to the release without validating its MIT attribution and its move/wall representation, legal jumps, wall path constraints, threefold rules and deterministic timeouts.
5. Every external candidate must implement common native-search result schema (legal `pv[0]`, `elapsedMs`, `depth`/`nodes` if applicable) or use a separately tested bridge. Validate on 100+ legal states before a tournament.

## Implementation order and acceptance tests

A. **External rules adapter:** Convert Atlas `{p,walls,left,turn,winner}` to imported engine state and reverse its actions. Test 100+ sampled states, including jumps and all wall collisions; do not silently correct illegal moves.
B. **MCTS challenger:** Port/reuse MIT heuristics in a separately versioned binary. Time control hard 500ms, precomputed adjacency, fast bitboard walls, UCT + opponent-aware rollouts and top-K wall expansion. Compare legal moves and node/simulation throughput; quick 15 games vs actual 5.3.
C. **Neural challenger:** Obtain Sigma policy/value weights and ONNX runtime, verify inference shape, policy indices and side-to-move symmetry. Measure forward-pass latency and legality before adding PUCT. GPU/model memory and training are hardware contingent.
D. **Tactical/endgame hybrid:** Terminal and immediate-threat solver first, zero/one/two-wall endgame proof as separately tested modules, then MCTS or policy-guided search for middlegame. Reject any switch that reduces held-out win rate.
E. **Training:** Hold out validation openings before self-play. Use match data against diverse reference engines, checkpoint network/model SHA, opponent pool, paired Elo and tests against latest fixed Atlas5.3. Training cannot be declared complete without saved weights and actual match reports.
F. **Release:** 15-game gate after each code change, independent 200+ games and stronger public-engine benchmarks, timeout/legal/symmetry/repetition tests, human playtesting. Target >=80% vs 5.3 without opening leakage; cannot promise it in advance.

## Current status

Research and initial source acquisition only. No independent MCTS engine, verified Sigma weights, new 15-game contender benchmark, 200-game result, human-play win rate or 80% result exist yet. The existing original-equivalence Reborn stays in place; do not promote an untested replacement.
