# SIGMA4 original weighted research: 2026-11-05

## Reproducible comparison

Candidate policy: scripts/sigma4-weighted-research-choice.mjs, Sigma3 200-simulation MCTS with weighted root visits and Q. Parameters: sample rate .72, visit temperature 1.2, Q temperature .15, maximum Q drop .15; minimum five visits, minimum ratio .06. No tree reuse and native workers deterministic.

Six distinct recorded six-ply opening fixtures, both candidate seats, and 200-ply game cap. Exact local worker and policy hashes are stored in the data. The Sigma2 baseline worker has preexisting uncommitted changes. This is not a new neural network, nor the live three-ply Sigma4 controller.

- Against current Sigma2: 9W-3L, 6 wins as first seat and 3 as second; 12 unique games.
- Against current Sigma3: 6W-6L, 3 wins as first seat and 3 as second; 12 unique games.
- No game cutoff or illegal move. Each opponent was evaluated from six different openings.
- Candidate 95% Wilson win intervals: Sigma2 46.8%-91.1%, Sigma3 25.4%-74.6%.
- The observed win rate does not prove dominance over both opponents.

## Loss investigation

Native root moves changed by stochastic selection, per game:
- Against Sigma2: mean 1.44 changes on wins versus 4.33 on losses.
- Against Sigma3: mean 1.33 changes on wins versus 3.83 on losses.

This association is not a causal claim: longer or more difficult games can cause more deviations. Compare native versus weighted action on identical boards with matched strong opponent continuation rollouts before changing policy.

## Next improvements

1. Freeze worker/model/policy hashes and require legal action replay, 200 simulations, equal baselines and no unfinished games.
2. Collect 40 or more genuinely distinct paired fixtures for EACH opponent; include hard wall/goal-defense and midgame states. Reserve an unseen holdout, and account for seat pairing in uncertainty estimates.
3. Mine the first harmful weighted overrides. Verify action alternatives under at least five matched opponent continuations; evaluate Q drop, visits, path differences and wall resources.
4. Build weighted-v2 preserving meaningful weighted Q/visit diversity but reducing risky sampling in tactically decisive states. Do not impose a blanket conservative rule: the former guarded trial was nearly identical to Sigma3.
5. Evaluate v2, original weighted and native Sigma3 at the same MCTS budget on untouched paired fixtures against Sigma2 and Sigma3.
6. Promote to the website default only after statistically credible advantage over BOTH baselines: at least 40 seat-swapped fixtures per opponent, clustered 95% lower win confidence over 50%, sufficient unique games, no cutoff/legality regression, passing native API integration. No engine can guarantee universal victory.
7. Test loss boards from human games for missed wall traps and race tactics before deployment.

## Current promotion decision

NOT APPROVED. The candidate tied Sigma3 6-6, and 9-3 against Sigma2 alone is too small to establish superiority. The existing web SIGMA4 configuration and default remain unchanged.

Reproduce: node scripts/sigma4-original-vs-23.mjs; node scripts/sigma4-original-weighted-assessment.mjs. Raw data: evaluation/sigma4-original-weighted-vs-sigma23-20261105.json. Audit: evaluation/sigma4-original-weighted-20261105-assessment.json.
