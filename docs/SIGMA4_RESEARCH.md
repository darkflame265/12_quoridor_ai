# SIGMA4 research pipeline (experimental, not promoted)

## Why this exists

SIGMA2 and SIGMA3 share the frozen Sigma ONNX policy/value model. Recent ad-hoc heuristics sometimes reverse a win into a loss. Historically 24 evaluated games contained only two unique action sequences. The purpose of SIGMA4 research is to acquire new independent evidence and learn only from verified counterfactuals, rather than hard-code another tactical override.

## Reproducible steps

1. `node scripts/sigma4-research-games.mjs`"È›y¯ßy‘ legal six-ply randomized **controlled** openings, four opening families, both SIGMA3 seats versus SIGMA2 (8 total games). Records every played state, proposed actions, sampled MCTS root children, path lengths, 200-sim cap and full sequence hashes. Resume support.
2. `node scripts/sigma4-mine-decisions.mjs`+ßuÁ‚ùÁT deduplicate states, split train/holdout by *opening seed*, select top near-valued alternatives from lost games; complete opening history included. A loss does not imply a specific move was wrong.
3. `node scripts/sigma4-counterfactual.mjs`"È›y¯ßy‘ select two distinct training opening families and evaluate both forced root choices under equivalent downstream engine settings. These are single deterministic continuations, **not** reliable ground-truth labels.
4. `node scripts/sigma4-train-pairwise.mjs`+ßuÁ‚ùÁT train a regularized pairwise ranking model from verified action-level outcome differences *only when*"È›y¯ßy’40 independent training roots, ∫w^~)ﬁu20 independent holdout roots and"È›y¯ßy’5 continuations per action exist, with separate opening families. Current pilot intentionally blocks training. A successful offline model is not automatically installed or promoted.
5. `node scripts/sigma4-research-gate.mjs`+ßuÁ‚ùÁT verify game completeness, unique sequences, both seats, no cutoff, holdout isolation, and worker provenance SHA256 and worktree cleanliness. Production promotion requires **all** validation gates and independent strength evaluation; this script never changes the engine.

## Research controls and caveats

- The opening prefix is intentionally controlled/random; it is **not** an autonomous SIGMA4 opening. Do not use the resulting win rate as a production Elo estimate.
- SIGMA3 and SIGMA2 remain untouched. There is no production SIGMA4 inference worker and **no new trained weights** until sufficient verified data exists.
- Both engines currently use the frozen `vendor/sigma-quoridor/models/best.onnx`; analyze the winning move against strong countermoves instead of treating the winner's every action as optimal.
- Opening split, rather than random per-turn split, avoids leaking nearly identical states into train and holdout.
- The unique full-game hashes, not just raw game count, matter. Exact repeated games should be discounted.
- Worker files that are already modified locally must remain untouched; SHA256 fingerprints and Git status warn that results cannot be reproduced from HEAD alone.
- Use several opponent seeds / searches and independent opponents before treating a branch as a training target. The initial 8-game/4-branch experiment is purely a pipeline demonstration.


## Expanded research cycle
Run sigma4-research-extended-games.mjs, sigma4-selfplay-games.mjs, sigma4-repeated-branches-paired.mjs, sigma4-evaluate-coverage.mjs, sigma4-multiseed-evidence-paired.mjs, sigma4-train-pairwise-paired.mjs, then test_sigma4_expanded.mjs. The seed-paired experimental continuations use bounded sampling only from visited MCTS alternatives, not a production policy. Different seeds with identical action sequences do not count as independent evidence. Training requires five distinct continuations per action and disjoint training/holdout opening families.

**Reproducibility correction:** The original pilot, extended, and self-play runners used server/sigma-process.mjs, whose current implementation forces tree reuse ON for sigma2/sigma3. Their saved processSettings metadata was corrected to reuse=true. The new matched-seed branch trial uses scripts/sigma4-isolated-process.mjs with reuse OFF; do not pool raw win rates across these different search conditions.


## Natural openings and policy-collapse diagnostic
Run node scripts/sigma4-natural-games.mjs to record complete games from the true initial board, without forced opening moves. This first native-policy sample used three seeds in SIGMA3/SIGMA2 role-swapped and self-play matches (nine games), but all nine complete action sequences were identical, despite nonzero built-in exploration. This is a crucial failure of opening diversity, not nine independent strength observations.
Run node scripts/sigma4-natural-exploratory-games.mjs for a separate research-only control. It uses chooseResearchCandidate from scripts/sigma4-explore-root.mjs to occasionally select a legal, visited, near-value MCTS candidate after search. Six exploratory games produced five unique sequences and 57 departures from native engine actions. These games measure diversity only, not performance of native Sigma3. They are ALL labeled train/research-only; no exploratory independent holdout has been established.
Run node scripts/sigma4-natural-mine.mjs and node scripts/sigma4-natural-audit.mjs. Board-state collisions between native training and held-out seeds are excluded in both splits: 174 raw near-value candidate observations fell to ZERO usable split-disjoint cases. This deliberately blocks policy training to prevent leakage. Verify with node scripts/test_sigma4_natural.mjs. Do not promote Sigma4 or use these small samples for production strength claims.


## Weighted MCTS research and early-opening annealing
Weighted root research (sigma4-weighted-research-choice.mjs) samples only legal visited alternatives with probability proportional to visits^(1/temperature) times exp((Q-maxQ)/qTemperature). This never modifies the production workers and preserves 200 MCTS simulations. Unit-test using test_sigma4_weighted_choice.mjs.
Weighted natural-opening trial (sigma4-natural-weighted-games.mjs): 9 games, 7 distinct full sequences, but only 1 distinct first-six sequence, versus 1/9 full sequences in the native baseline. The annealed early-research trial (sigma4-opening-diversity-games.mjs), which broadens candidate sampling for the first 8 plies, produced 4 distinct full sequences and 2 first-six sequences in 6 games. These samples have different seed sets and are diversity tests, NOT matched evidence of greater strength.
A train/holdout state-key filter in sigma4-weighted-mine.mjs excluded 6 overlapping states; 90 training states and 32 held-out states remain, but none are verified better-action labels. Two seed-paired research continuations of one forced alternative (d5 vertical wall versus f6 pawn move) yielded 1 improvement and 1 tied loss, not proof of superiority. The promotion gate in sigma4-weighted-training-gate.mjs rejects any unverified branch or missing independent production-strength comparison.
Run sigma4-weighted-training-gate.mjs, test_sigma4_weighted_choice.mjs and test_sigma4_weighted_data.mjs. Future work: independent midgame branch labels with multiple strong opponent searches; validated model training only after frozen holdout construction.


## Strong-response validation and paired SIGMA3 direct duel
The new scripts sigma4-strong-reply-counterfactual.mjs and sigma4-vs-sigma3-pilot.mjs preserve the research-only Q/visits sampling engine. They compare two independent training-game loss roots with two matched continuation seeds per root. The opponent uses unmodified 200-simulation native Sigma search; only the tested side samples MCTS alternatives. For d5 vertical wall versus f6, and c9 vertical wall versus e8, both matched seed pairs tied in binary outcome. No learned label or claimed best action.
A direct weighted research SIGMA4 versus native SIGMA3 trial used two fresh seeds and swapped sides: the research candidate won 2/4 games (1 as first player, 1 as second), with 4 distinct full sequences. This DOES NOT establish superiority; model training and production integration remain blocked. Run sigma4-strong-reply-direct-gate.mjs to verify legality, matched action roots, paired roles and report to evaluation/sigma4-strong-reply-direct-gate.json. More independent roots, strong replies, and statistically useful held-out head-to-head games are required before promotion.


## Expanded paired direct trial and loss-branch evidence
Run node scripts/sigma4-vs-sigma3-expanded.mjs to collect 12 direct games (six evaluation-only seeds, candidate seat swapped per seed) against native frozen SIGMA3, with both sides using 200-simulation SIGMA3 MCTS. The only candidate change is the research weighted Q/visit action choice. Results: SIGMA4 8 wins and 4 losses (5 first-seat wins, 3 second-seat wins), 11 distinct entire sequences and 3 distinct six-ply prefixes. The Wilson 95% interval for the observed 66.7% win proportion is approximately 39.1% to 86.2%; superiority is NOT statistically demonstrated. Unrelated preexisting files were untouched.
Run node scripts/sigma4-expanded-branch-validation.mjs for two matched follow-up seeds on each of three training-only loss roots (12 total games). All original-versus-alternative action pairs tied in binary result. These are NOT training ground truth. The baseline Sigma2 worker has preexisting local uncommitted modifications; its SHA256 is tracked in the assessment.
Run node scripts/sigma4-expanded-assessment.mjs to replay entire new games, check paired role assignments, branch legality, provenance hashes, count unique games and calculate Wilson interval. Promotion and policy training remain blocked. Next requirement: more independent starting situations and enough randomized evaluator strength tests on a frozen candidate before promotion.
