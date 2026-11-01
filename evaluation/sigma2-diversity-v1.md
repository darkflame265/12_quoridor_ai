# Sigma2 competitive candidate diversity ? initial experiment

Sigma1 remains unchanged, Sigma2 simulations capped at 200.

Sigma2 now selects among near-top PUCT candidates (at least 72% of the leading child visit count, minimum three visits). Opening / middlegame applies temperature 0.65 for plies 0-19 and 0.35 for plies 20-43, then returns to deterministic choice. Candidates whose resulting full state occurred in the last 48 plies are excluded if at least one fresh near-top candidate exists. The check is full board (both pawns, all walls, remaining walls, side-to-move), rather than pawn-only history.

This is a **selection-stage prototype**, not MCTS-internal draw value propagation. It cannot eliminate repetition when all strong candidates repeat, and it does not guarantee a safe or strong alternative. The previous failed unconditional backtracking filter is intentionally not restored.

4 exploratory standard-start Sigma1-vs-Sigma2 games (fixed seed 4411, no legacy EXPLORATION override): Sigma2 3 wins, Sigma1 0, 1 200-ply undecided; only 3 distinct game hashes. This is a tiny evaluation sample, not proof of superiority. Repetition remains unresolved.

Tree reuse remains opt-in (off by default) pending multi-turn correctness checks. Site and server default Sigma1 remain unchanged.
