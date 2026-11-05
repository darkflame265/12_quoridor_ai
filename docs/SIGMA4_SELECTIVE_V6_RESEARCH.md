# SIGMA4 selective opponent reply V6  research outcome (2026-11-05)

## Status
Experimental only. No changes to the live engine, engine selector, default value or existing unrelated working tree changes.

## What V6 does
Based on the V3 one-ply tactical safety wrapper and original weighted-root research policy. Additional Sigma3 response searches run only when:
1. weighted choice differs from native root choice;
2. the native choice cannot immediately lose;
3. a path disadvantage or MCTS root Q gap signals potential risk;
4. the initial MCTS root search leaves at least 80ms of a nominal 500ms move budget after a 25ms reserve.

When two extra reply evaluations run, V6 uses a supplementary timeout and falls back to the original V3 safe choice if the deadline or worker fails. **The timeout limits waiting, not worker computation; it does not terminate the Python search.** The initial root MCTS is not covered by this supplementary deadline. These limitations preclude calling V6 a 500ms engine.

## Measured runtime
On the same initial position, three native Sigma3 searches gave wall times of 1035ms, 657ms and 544ms (including first-process startup on the first measurement). Reported worker times were 582ms, 648ms and 540ms. All exceeded the 500ms total move target; no statistical latency claim from only three samples.

## Tests and games
- `node scripts/test_sigma4_selective_v6.mjs`: historic weighted decision reproducibility, no additional search when budget is spent, bounded waiting when supplemental search never resolves; measured timeout test around 112ms.
- An independently constructed six-ply opening (not in original/holdout fixture sets), two seats against Sigma3: original weighted 2 wins / 0 losses, V6 2 wins / 0 losses. Paired complete game hashes identical. **No improvement observed.**
- Existing suite: 106 tests pass. Vite production build succeeds.
- Only one new starting position was evaluated, and Sigma2 was not separately matched for V6. It is not a reliable generalization estimate.

## Promotion gate and next research
Do NOT promote V6 or replace default Sigma4. To target 500ms end-to-end, first optimize native inference / simulation budget, implement true cancellation and verify completed-action latency with percentiles. Any reduction in base simulation count must be evaluated for strength regression on untouched, paired, seat-swapped openings against both Sigma2 and Sigma3. V5's prior 6-0 research sample is too small and partially reused training data to establish a better engine. V6 currently prioritizes avoiding extra workload over V5's extra tactical checks; on the tested opening it did not change any action.
