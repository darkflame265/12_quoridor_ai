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
