# Sigma development ? Sigma 1 baseline and Sigma 2 candidate

## Baseline
Sigma 1 is the existing playable Sigma PUCT 50. Original ONNX file is preserved in vendor/sigma-quoridor/models/best.onnx. The public engine identifier remains sigma so old sessions continue working. The default worker uses Sigma 1, fifty simulations, no exploration.

## Completed self-play
Ten Sigma 1 vs Sigma 1 games began from the standard centered 9x9 opening with zero placed walls and 10 walls each. Development exploration 0.3 and seed 2718 produced 10 unique action sequences. Player 0 won 7 games and player 1 won 3. All traces include moves, PUCT candidates, path lengths, and wall effects. This is tactical discovery, not evidence of improved performance.

## Sigma 2 experimental only
Sigma 2 uses the same network weights and 50 PUCT visits, with extra immediate-goal and imminent-opponent-goal defensive checks. It is NOT a retrained model. The public site still uses Sigma 1.

A direct comparison was configured for eight games at exploration zero, but only two completed: both ended without a winner at 200 plies and have the same game hash. This is insufficient to claim Sigma 2 is stronger. The remaining six games were intentionally not completed.

## Next steps
1. Complete longer self-play with seeded strategy diversity while always starting from the same standard opening.
2. Analyze repetition loops, one-turn threats, wall efficiency and lost endgames.
3. Conduct blind-seed balanced Sigma 1 vs Sigma 2 tests plus Atlas regressions.
4. Promote only when wins and strategic stability improve. A universal 100% win rate cannot be guaranteed.
5. Retraining neural weights requires a separate compatible training pipeline; do not overwrite the Sigma 1 ONNX model.

Self-play command: node scripts/tournament-sigma-selfplay.mjs --games 10 --exploration 0.3 --seed 2718
Comparison command: node scripts/tournament-sigma-selfplay.mjs --compare --games 8 --exploration 0 --seed 2718 --out reports/sigma-selfplay/sigma1-vs-sigma2-candidate8.json
Analysis command: node scripts/analyze-sigma-selfplay.mjs reports/sigma-selfplay/sigma1-vs-sigma1.json evaluation/sigma1-selfplay-10-summary.json

The resume option requires the same version, model hash, target game count, exploration and seed. Different game counts use separate output files.
