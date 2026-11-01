# Sigma 2 legal-reply tactical defense experiment

## Change
The Sigma 2 experimental worker now evaluates the actual legal pawn replies to its selected PUCT move, including pawn contact, straight jumps, and diagonal jumps via the Sigma game-state transition API. When the currently selected action permits an immediate opponent goal and another visited root candidate avoids it, Sigma 2 selects the safest candidate with the largest PUCT visit count.

Sigma 1 is unchanged. Original ONNX weights and the website default are unchanged; PUCT remains 50. The protective heuristic is a one-ply check, not a complete forced-win search. A Sigma rule-conversion equivalence suite against the authoritative JavaScript engine remains necessary.

## Preliminary head-to-head
4 Sigma 1 vs Sigma 2 games were played from the fixed standard opening, alternating assigned variants and with exploration disabled. Each side won 2 games, while only 2 distinct game hashes appeared. No strength gain is established.

## Further required work
1. Cross-check converted state/action legality against the JS engine in contact and wall-heavy test fixtures.
2. Test human-loss tactical positions and response continuations with seeded diverse opponent strategies.
3. Perform larger balanced evaluation and avoid interpreting duplicate games as independent evidence.
4. Keep Sigma 2 experimental until its performance exceeds the Sigma 1 baseline.

## Exploration-only adversarial probe
Four further games at exploration=0.25 and seed=9317 produced four distinct hashes. This is a tactical diversity probe, not a clean deterministic strength comparison. The results are retained separately and the default Sigma 1 remains unchanged.
