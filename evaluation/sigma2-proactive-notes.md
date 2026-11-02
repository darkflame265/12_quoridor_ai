# Sigma2 preventive cycle-risk screen

The user's request is proactive avoidance rather than penalizing the third or fourth occurrence of a loop. The opening first four forward pawn moves are deliberately unchanged.

Implemented in Sigma2 only: after 200 PUCT simulations and existing terminal safeguards, inspect sufficiently searched, close-valued root candidates before choosing. For a candidate pawn move that makes no path-distance progress, examine up to three opponent pawn replies prioritizing shortest-path advancement, and all legal own pawn moves after each. Flag a prospective stall if a reply leaves no own pawn move improving from the candidate destination. When selected candidate is risky and a comparable alternative is safe, prefer that alternative; keep defense moves legal and preserve all immediately forced terminal safeguards.

Caveats: the screen does not inspect opponent wall responses, so it does not guarantee all cycles are avoided. Its extra reply checks add CPU work beyond the PUCT 200-simulation cap. It is not an exhaustive strategic proof. It is intentionally conservative to avoid weakening strong defensive or offensive lines.

Regression: prior top-level game d7/c7 test still passes (avoid plies 26/28, recommends c6 at 30).
Pilot: 4 Sigma1/Sigma2 games, 2 wins each, 0 simulation cutoffs, 4 distinct traces. Critically, this pilot had ZERO preventive move overrides, so it demonstrates search stability but NOT effectiveness at reducing future loops. A larger adversarial and specific 136-ply game replay is necessary before claiming strength or cycle-reduction improvement.

No change to Sigma1 or existing first-four-move opening. Live web launcher was not restarted.
