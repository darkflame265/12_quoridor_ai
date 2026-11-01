# Sigma2 ? top-level user game (14), 22?30-ply oscillation

Scope: top-level records of the user attachment, NOT the rebased screenSegments records.

## Verified replay
- Plies 22/24/26/28: d7, c7, d7, c7.
- Plies 26/28 repeated earlier pawn squares while the opponent changed walls and moved.
- The public sigma service is Sigma1 PUCT50. The original case did not use Sigma2.

## Confirmed
- Original Sigma1 50-sim worker reproduced the same actions at 22/24/26/28/30.
- Sigma2's original 72%-of-best candidate window left only the repeating top choice; a len(close)>1 guard bypassed the progress screen.
- At ply 26, the leading d7 move had 17 PUCT visits; c6 had 9. At ply 28, c7 had 30 visits; a candidate wall (5,5,h) had 12.
- Sigma2 now checks no-progress returning pawn squares, widens to root candidates with >=25% of top visits and >=2 visits only for a detected loop, and deterministically chooses the most-visited surviving candidate.
- MCTS internal repetition evaluation incorporates previous actual-match full states during tournament use. Full-board repetition alone cannot catch a loop when opponent moves or changes walls.
- Candidate-filter empty-list runtime exceptions in first trials were fixed and fresh head-to-head runs completed.

## Outcomes and limits
- In the exact historical positions, Sigma1 still recommends the repeated moves. Sigma2 proposes c6 at ply 26, a legal wall at 28, and c6 at 30.
- Direct top-level replay and opening regression tests passed.
- Fresh two-game Sigma1-vs-Sigma2 evaluation: Sigma2 0 wins, Sigma1 2 wins, no undecided, 2 distinct hashes. Not adequate to prove a regression, but definitely insufficient to promote Sigma2.
- No neural retraining; Sigma1 default and model unchanged; Sigma2 maximum 200 PUCT simulations. The public server still runs Sigma1.

## Next validation before production
- Judge alternative candidate replies and positional impact across multiple plies, not only avoid visited squares.
- Confirm a blocking wall is genuinely better than the original repetition and other pawn moves.
- Compare against Sigma1 on at least 20 independent diverse trajectories, balanced by side, with external opponent policies.
- Validate passing historical full states from the live app to the worker before any Sigma2 deployment.
