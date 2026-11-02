# Sigma2 prospective wall-response screening experiment

The user explicitly wants to preserve the natural four opening forward pawn moves and prevent loops BEFORE they begin, not punish a player only after repetition.

## Code
Expanded the earlier Sigma2 future_stall screening to consider up to three legal opponent wall replies threatening the pawn race and three pawn replies. For each reply, inspect whether the mover retains a legal improving pawn continuation. The screen only considers close-valued, sufficiently visited candidate actions and keeps terminal tactical safeguards. This is a limited heuristic and cannot guarantee loop prevention, especially if progress requires placing a wall.

## Key game reproduction
Full 136-ply loss from game index 2 in sigma2-reviewed-policy20.json was inspected. The 4-ply pawn oscillation began around ply 23: Sigma2 repeatedly oscillated between (4,3) and (4,4) while Sigma1 oscillated (5,3) and (6,3). Independent snapshots from plies 17,19,21,23,25,27,29 were re-run under Sigma2, with legal move comparisons archived in sigma2-preventive-wall-game2.json. Those independent state queries do NOT reproduce a full alternative game or prove the new safeguard fired.

## Mini tournament
Four games Sigma1 vs Sigma2, seed 20261118, 200 PUCT sims: Sigma1 3 wins, Sigma2 1 win, zero 200-ply cutoffs, four unique games. The new safeguard changed ZERO moves in this set. Therefore no measurable benefit established.

## Deployment
The new wall-aware override is opt-in through SIGMA2_PREVENTIVE_WALL_OVERRIDE=1 and disabled by default. Keep it experimental rather than allowing an unproven slow check to alter regular game strength. Original baseline Sigma2 preventive pawn-only screening remains present. Sigma1 and first four opening moves unchanged.

## Next
Design an opponent-wall-induced stall fixture where the heuristic has a positive trigger, and do side-swapped paired rollout comparisons. Use wider tactical analysis and actual game continuations before enabling this path by default.
