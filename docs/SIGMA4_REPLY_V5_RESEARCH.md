# SIGMA4 reply-search V5  research report (2026-11-05)

## Status
**Experimental only.** Do not promote V5 to the playable engine selector or default.
The production Sigma4 code and runtime configuration were not changed.

## Method
Keep the original stochastic, visit-and-Q weighted research selection and
V3's exact one-reply goal defense. When the weighted choice differs from the
native MCTS root choice, search Sigma3's response to each candidate.
Compare the resulting pawn shortest paths and remaining wall stock.
If the native candidate beats the weighted one by at least two heuristic
points, choose native. Never substitute native if it exposes an immediate
opponent goal. Invalid or failed reply searches fall back to V3.
This is a one-reply heuristic, not full adversarial minimax.

## Validation
- Historical SIGMA3 loss: three candidate deviations inspected (plies 12,
  18, 20 of game 14). V5 changes ply 20 based on response search.
- Previously screened opening / SIGMA3, both seats: original **2W-0L**, V5 **2W-0L**,
  with identical complete action sequences.
- Previously inspected historical opening-2 / SIGMA3, both seats:
  original **1W-1L**, V5 **2W-0L**. V5's reply-search gate intervened
  in the rescued game. This is a training case, not an independent test.
- Previously screened opening / SIGMA2, both seats: original **2W-0L**, V5 **2W-0L**.
- All six pairings per variant ended normally. Aggregate: original
  **5W-1L**, V5 **6W-0L**, with strong fixture reuse and no statistical
  claim of general superiority.
- Existing test suite: 106 passing tests, build successful.
- Additional fallback test checks missing-reply handling.

## Files
- `scripts/sigma4-reply-search-v5.mjs`: experimental asynchronous policy.
- `scripts/sigma4-reply-v5-loss-audit.mjs`: historical position analysis.
- `scripts/sigma4-reply-v5-paired-screen.mjs`: previously screened Sigma3 pair.
- `scripts/sigma4-reply-v5-training-screen.mjs`: historical opening-2 pair.
- `scripts/sigma4-reply-v5-sigma2-screen.mjs`: previously screened Sigma2 pair.
- `scripts/test_sigma4_reply_v5.mjs`: fail-safe check.
- `evaluation/sigma4-reply-v5-*.json`: outputs with sequences and hashes.

## Important limitations and next work
The paired screens each use only one starting fixture, and opening-2 is known
training data. The results are not generalizable. Searching two additional
200-simulation Sigma3 replies can substantially exceed the site's per-move
budget; the existing reports do **not** include that extra response-search
time in their elapsedTotalMs field. Before promotion, measure end-to-end
latency and compare across many unseen, seat-swapped openings, including wall
and late-game positions. Evaluate against both Sigma2 and Sigma3 and include
at least 40 independent fixtures per opponent. Verify the V5 intervention
against deeper responses and test a latency-aware design separately.
