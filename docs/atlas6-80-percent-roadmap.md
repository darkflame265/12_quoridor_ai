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

## 2026-11-01 actual external MCTS integration and screening
- Vendor MIT-licensed gorisanson JS browser engine under vendor/gorisanson-quoridor-ai with copyright/license intact. scripts/external-mcts-bridge.mjs reconstructs game state and uses original MCTS search through isolated Node vm; the adapter checks each selected action against our authoritative game rules.
- scripts/test-external-mcts-bridge.mjs passed pawn/wall legal-move checks for 100 existing fixture states. In an earlier experiment with strict wall replay and 30 simulations, illegal move and reconstruction failures occurred. Those matches are INVALID as strength comparison (0/15 including forfeits). Corrected replay for final test; 100-simulation experiment has ZERO forfeits.
- scripts/tournament-external-mcts-vs53.mjs ran exactly 15 games on paired openings 085-092 against true native profile candidate (5.3), at opponent 500ms/4 cores. External MCTS with 100 simulations: **0W/15L = 0.0%**, zero illegal-move forfeits, zero reported over-budget moves; observed external per-move maximum across games 101.4ms. Same reference openings old Reborn clone 7W/8L = 46.7%.
- This experiment is intentionally NOT a fair 500ms CPU-budget comparison; it screens a small-budget JS MCTS. A 500ms hard-deadline, sufficiently many simulations, broader legality tests and deeper tactical/endgame logic are prerequisites to evaluating a serious challenger. Baseline Reborn remains unchanged; no 80% claim.
- SigmaQuoridor model archive acquisition timed out; no neural inference, training, 200-game validation or human playtests completed.

## 2026-11-01 SigmaQuoridor ONNX policy-only first match
- Downloaded Sigma 9x9 best.onnx (11,663,428 bytes) and core Python/C++ sources to local `.external/quoridor-research/SigmaQuoridor-acquired`. ONNX CPU load and inference passed. Model SHA is recorded in `evaluation/atlas6-sigma-policy-15-20261101.json`.
- Built `scripts/sigma-inference-worker.py` for origin/turn/wall coordinate conversion; authoritative Atlas legal actions are sent from `scripts/tournament-sigma-vs53.mjs` to reject mismatch.
- Against actual Atlas 5.3 `candidate` over fixed 15 starts (085-092), 500ms/4core for opponent, Sigma policy-only 10W/5L = **66.7%**, 0 forfeits, 0 Sigma time overruns. This is an initial screening, not an equal-compute comparison and not a measured >=80% promotion.
- Do not replace default Reborn yet. Required: more randomized position agreement checks, persistent model acquisition/packaging, 500ms MCTS/PUCT hybrid, fresh 15 and independent >=200 balanced games, human game tests.

## 2026-11-01 Sigma PUCT milestone (screening only)
- Added switch `SIGMA_MODE=puct` to `scripts/sigma-inference-worker.py`, using upstream Sigma `MCTSAgent`, policy softmax priors, value output, and 20 simulations, with authoritative Atlas legal-action filtering on the selected root action. Candidate runs via `node scripts/tournament-sigma-vs53.mjs puct`.
- Actual Atlas5.3 candidate, fixed openings 085-092, 500ms/4 cores opponent: **12W, 2L, 1 undecided / 15, win percentage 80.0%**; 0 illegal-action forfeits and 0 Sigma 500ms overruns. Comparison baseline policy-only 10W/5L = 66.7%.
- This is NOT statistical proof of true >=80% win rate. Candidate MCTS runs 20 simulations instead of fully equalized compute and there is a 200-ply undecided game. Future priority: random held-out and paired 200+ games, full legal move set comparison, repetition handling, 500ms hard deadline / action fallback, deployable model packaging, human games. Existing Reborn remains unchanged.
