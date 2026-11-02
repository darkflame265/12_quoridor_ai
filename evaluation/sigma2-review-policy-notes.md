# Sigma2 move-by-move postgame verification (2026-11-02)

## Finding
From 20 previous games, 775 Sigma2 plies were reviewed and 242 one-reply geometric flags were recorded. The one-reply heuristic favored a horizontal wall in game 4 ply 35, but that is not sufficient to infer a superior move.

## Deeper bounded test (not exhaustive)
- Game 4 ply 35; played pawn move (5,3), candidate wall (2,4,h).
- Beam minimax width 4 at 4 plies, wall-aware geometric score (larger is better): played 3, wall 6.
- Beam width 3 at 6 plies: played 3, wall 5.
- Beam width 2 at 10 plies: played 6, wall 5.
- This heuristic is unstable under depth and width; it does not prove a forced winner.

## Actual engine continuation (10 further turns)
Both choices were tested from the saved state, then followed by actual Sigma2 versus Sigma1 worker recommendations for ten turns. Both remained unfinished.
- Original first move: distance pair [5,16], wall inventory [1,4] at cutoff.
- Alternative first wall: [4,12], wall inventory [1,4].
This is a sample continuation, NOT a full-game result or a proof of optimal play.

## Conservative policy change
The previous one-opponent-reply override is now explicitly opt-in using SIGMA2_ONE_REPLY_OVERRIDE=1, disabled by default. Other safeguards and MCTS remain enabled. This is safer than forcing a candidate whose longer-horizon quality is unproven.

## Independent 20-game validation
Run: 20 games of Sigma1 vs Sigma2, 200 PUCT sims for Sigma2, opening diversity 0.15, seed 20261114 (both side assignments alternate).
Results: Sigma1 10 wins, Sigma2 10 wins, 0 simulation cutoffs, 19 distinct trajectories, 16 first-player wins and 4 second-player wins. Thus equal head-to-head outcomes; no proven Sigma2 superiority. The older one-reply-override policy was only run 5/20 games with this seed before it was stopped, so this is NOT a fully matched 20-pair A/B test.

## Next
Evaluate counterfactual alternatives using multiple independent engine continuations and paired random seeds; constrain candidate heuristic to proven tactical emergencies or sufficiently robust multi-ply results. Investigate marked first-player advantage; do not confuse game diversity with game strength.
