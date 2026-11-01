# Sigma2 finishing guard: initial experimental patch

Goals:
- Do not miss a currently legal immediate winning pawn move when candidate filtering and stochastic opening diversity are active.
- If the opponent is one physical row from the goal, inspect legal pawn replies for each PUCT root child and prioritize candidates that do not allow a direct opponent goal (when such candidates exist).
- Preserve Sigma1, ONNX neural weights and Sigma2 max 200 PUCT simulations.
- Make the tournament distinguish a 200-ply artificial test cutoff from Quoridor game draws, recording repetition metrics for new cutoff records.

Important limits:
- This is **one-ply tactical safety**, not forced multi-ply win proof.
- The upstream Sigma Python game has a draw convention at depth >= 200, which is not a standard Quoridor result; the game used in the web app does not award a draw. The artificial 200-ply tournament cap is still present.
- The patch does not promise every game ends or eliminate all progress loops. More work is needed on complete game history inside search, multi-ply endgame analysis and independently validated higher strength.
- Full 20-game re-evaluation of this patch has not yet been run; a short regression tournament and the user d7/c7 replay are necessary but insufficient.

