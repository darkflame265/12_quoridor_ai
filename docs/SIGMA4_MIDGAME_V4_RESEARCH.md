# SIGMA4 midgame path-risk v4 (research-only)

## Status
Experimental policy, **not promoted** to the live website or default selector.
Implementation: `scripts/sigma4-midgame-risk-v4.mjs`.

## Method
Preserves the original weighted root policy and the v3 one-reply tactical guard.
For midgame positions with both shortest-path distances between 3 and 8,
if weighted sampling differs from native MCTS, evaluate the resulting pawn
shortest paths. Fall back to native only if the sampled move worsens path
outcomes relative to native: opponent gains at least 2 moves without own
compensation, or opponent gains 1 while own route becomes at least 2 longer.
Never fall back to native if it exposes an immediate opponent goal.

This is a heuristic for research, NOT an established improvement. It may
reject strategically valuable wall sacrifices or tempo plays.

## Historical decision replay
Run `node scripts/test_sigma4_midgame_v4.mjs`.
The 24 original weighted games reproduce 708 original choices. Relative to
the original, v4 differs at four positions, including the two v3 immediate
goal tactics and two new path-risk interventions (one in a winning game and
one in a losing game). A replay on the original trajectories does not prove
the changed continuations would win.

## Matched screening
Run `node scripts/sigma4-midgame-v4-matched-pilot.mjs`.
Screening uses one previously inspected legal six-ply opening per opponent,
both seats, original and v4 (8 total games). This is a training screen, not
an independent holdout. The script stores full game traces and worker hashes
at `evaluation/sigma4-midgame-v4-screening-20261105.json` and supports
resuming a compatible, partially completed run.

## Promotion requirements
Keep the production Sigma4 unchanged until the candidate beats the frozen
weighted reference on unseen paired openings and both Sigma2/Sigma3 opponents;
target at least 40 independent seat-swapped fixtures per opponent. Review
the two midgame overrides with counterfactual strong-opponent continuations.
A small pilot or historical trace cannot establish superiority.
