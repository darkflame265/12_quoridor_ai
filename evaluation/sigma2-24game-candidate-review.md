# Sigma2 24-game candidate evaluation (after c7e4d3f)

## Baseline and hypothesis
Production policy is c_puct=0.8 and root close ratio=0.88, max 200 PUCT simulations. We inspected its post-search stochastic choice. Experiment A reduced midgame choice temperature from 0.35 to 0.20 while leaving random exploration and the root candidate pool intact. Experiment B narrowed acceptable root children to 96% versus the production 88%, hypothesizing higher-confidence actions at risk of tactical rigidity.

## Exact matched comparison
Seed 20270203, 24 games per arm, same Sigma1 engine, alternating colors and 0.15 external exploration, complete traces archived.
- Baseline 0.88 / temp 0.35: Sigma2 19 wins, Sigma1 5 wins, no 200-ply cutoffs, 3 full position revisits, 23 distinct action sequences.
- Temp 0.20: Sigma2 19 wins, Sigma1 5 wins, no cutoffs, 3 revisits, 23 distinct sequences. All 24 full action sequences identical to baseline. In this fixture, temp tuning made no actual change.
- Close ratio 0.96: Sigma2 15 wins, Sigma1 7 wins, 2 unresolved 200-ply cutoffs (NOT draws), 279 full-position revisits, 19 distinct sequences. Only 1 of the 24 sequences matched baseline.

## Diagnosis
These experiments establish a narrower root candidate pool is not monotonically stronger: 0.96 removes useful alternatives and triggered more repetition in these trials. The temp experiment is inert for the tested positions, possibly because there are few similarly visited candidate actions after filtering; this is a hypothesis not proven by diagnostics. The root limitation is search evaluation and choice quality, not merely the amount of randomness.

## Decision
Both candidate policy changes rejected. Keep production default root close ratio 0.88 and temperature 0.35. Leave environment overrides in worker and matching CLI arguments for reproducible future experiments; do not activate them in the running server. Sigma1, model, initial four pawn advances and 200-simulation maximum unchanged.

## Next plan
Use the specific 0.96 loss/cutoff game trace to reconstruct the first state where it diverged from baseline, replay top viable wall and pawn choices into full continuations, and compare both win result and repeated full-board states before any behavior changes. Evaluate on independent seeds to avoid choosing a policy solely for one deterministic seed.
