# Sigma2 matched PUCT 0.65 evaluation

Two independent new seeds 20261213 and 20261221, 12 games per seed per configuration. The opening four moves, Sigma1, and Sigma2 maximum 200 PUCT simulations were unchanged. Total 48 games analyzed.

Seed 20261213: Sigma2 c_puct 0.8 won 10/12; c_puct 0.65 won 11/12. No 200-ply cutoffs. Repeated full-board positions: 0 versus 20.

Seed 20261221: Sigma2 c_puct 0.8 won 9/12; c_puct 0.65 won 9/12. No cutoffs. Repeated full-board positions: 0 versus 30.

Combined: c_puct 0.8: Sigma2 19 wins, 5 losses, 0 cutoffs, 0 position revisits. c_puct 0.65: 20 wins, 4 losses, 0 cutoffs, 50 position revisits.

The 1-win difference across 24 matches does not establish a robust improvement. Lower exploration concentrates search on current favored candidates, which may explain its larger full-board repetition count; this is a hypothesis, not proven individual error attribution. Do not enable 0.65 as the production default.

Added scripts/analyze-sigma-cpuct065-pairs.mjs for paired seed/seat outcome, plies, and exact full-position revisits. Its conservative adoption screening requires more than 2 extra wins and no increased repeats or cutoffs, not a statistical proof.

All 48 full-game traces were saved compressed in evaluation. Current production Sigma2 remains c_puct 0.8. Next: inspect recurrence onset before a wall/pawn response, compare alternative actual continuation games on stored state, and test across new independent paired samples before enabling any cycle guard. Existing first-four forward moves stay untouched.
