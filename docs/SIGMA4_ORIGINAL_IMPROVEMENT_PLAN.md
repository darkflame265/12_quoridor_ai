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
## 2026-11-05: weighted SIGMA4 v2/v3 evaluation update

### Decision: preserve original weighted policy; do not promote variants

After the earlier 24-game original weighted study (SIGMA2 9-3; SIGMA3 6-6), the locally prepared conservative adaptive-v2 experiment was replay-verified. On the six previously seen opening fixtures it dropped against SIGMA2 to 7-5 (original 9-3) and tied SIGMA3 6-6 (original 6-6). On four separate previously recorded holdout fixtures, adaptive-v2 had 4-4 against SIGMA2 versus original 5-3, and 3-5 against SIGMA3 versus original 5-3. Therefore simply limiting sampling by a fixed Q/visit threshold or override budget is not a proven improvement and is rejected.

A separate tactical-safe selector, scripts/sigma4-safe-original-v3.mjs, preserves original weighted sampling (rate .72, visit temperature 1.2, Q temperature .15, max Q difference .15; 200 Sigma3 MCTS simulations). It overrides the sampled choice ONLY to take an immediate victory or to prevent an immediately available opponent winning goal, including exhaustive legal emergency defense if necessary. Its independent tests verify a real archived goal-in-one tactical failure and legal wall defense. It is not a long-horizon solver.

### New matched pilot (same opening, seat, opponent, random seed)

Script: scripts/sigma4-safe-v3-matched-pilot.mjs
Dataset: evaluation/sigma4-safe-v3-matched-pilot-20261105.json
Replay and promotion check: scripts/sigma4-safe-v3-matched-audit.mjs
Report: evaluation/sigma4-safe-v3-matched-audit-20261105.json

Two newly selected legal six-move opening fixtures (not present in the earlier original weighted trial or earlier adaptive-v2 holdout) were run against SIGMA2 and SIGMA3 with both candidate seats and both versions. The candidate versions share the exact underlying 200-simulation Sigma3 network search. Sixteen games total, with all moves legal, complete outcomes and unique full sequences within each opponent-variant group.

| Opponent | Original weighted | Tactical-safe v3 | Rescued next-move losses |
| --- | --- | --- | --- |
| SIGMA2 | 3W-1L | 3W-1L | 0 |
| SIGMA3 | 1W-3L | 1W-3L | 0 |

There are ZERO outcome changes, ZERO live emergency defensive interventions and ZERO unfinished games in this pilot. The tactical safety feature is verified as correct in targeted tactical tests, but it does NOT increase observed benchmark strength here. Two openings per opponent are too few to claim any win-rate improvement. No statistically meaningful superiority over both existing engines is demonstrated, so production promotion is BLOCKED.

### Actual next priorities

1. **Paired counterfactuals on losses:** from sampled alternate move and original native move on exactly the same board, run several strong Sigma2/3 reply continuations. Attribute whether the sampled move introduced a real losing tactic, versus just correlating with tough positions.
2. **Threat detection beyond goal-in-one:** detect wall-induced detours, corridor traps and potential two- to six-ply tactics, but only add safeguards that pass controlled ablations with the weighted policy unchanged otherwise.
3. **Broaden and freeze fixtures:** at least 40 independent, seat-swapped legal opening and midgame fixtures against EACH opponent, including near-goal, wall-low, opponent-immediate-threat, long-race and loop states. Use separate tuning and untouched validation splits; treat paired games as correlated samples.
4. **Improve sampling only when proven:** train a context-specific risk gate from verified counterfactual labels, rather than globally suppressing Q/visit alternatives or random diversity.
5. **Promote only on evidence:** demonstrate statistically convincing improvement against both SIGMA2 and SIGMA3, with replay legality, no 200-ply cutoffs, diversity, no unstable backend behavior, and an end-to-end native API/browser check.

The live website's SIGMA4 remains its existing three-ply research controller and retains its default selection because the user requested that only a verified strongest weighted candidate replace it. No website/server production code was changed in this phase.
