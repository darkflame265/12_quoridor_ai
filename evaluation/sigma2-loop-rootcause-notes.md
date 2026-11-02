# Sigma2 cycle root-cause investigation

## Observed sequence
From completed game index 2 (136 plies, Sigma2 side 0 loses), repeated pawn movement starts at ply 23: Sigma2 squares (4,3) and (4,4), Sigma1 squares (5,3) and (6,3), continuing for many moves. On ply 22 Sigma1 installed a horizontal wall at (2,1), changing Sigma2 path length from 3 to 5. On ply 23 Sigma2 chose a pawn move to (4,3) and its shortest path increased from 5 to 6. The second repeated pawn move increased distance again from 6 to 7. This is recorded behavior, not a guess.

## Code mechanism
MCTS evaluates candidate positions through network values and searches with a fixed 200 simulation limit; its historical-position repeat signal is neutral unless the root player is clearly ahead. The old post-search loop filter narrows to visited, value-comparable alternatives and can keep the PUCT leader when none qualifies. The preventive wall screen is gated off by default and prior pawn-only screen did not change any moves in the pilots. Therefore no mechanism guarantees progress before oscillation in a wall-changing race. This is the supported failure mechanism; no claim that a single move choice proves a unique root cause.

## Experiment
Added a precommit, same-board path-regression guard to examine moving backward in wall-aware shortest path BEFORE applying a selected move; it only replaces the move with a search-valued comparable alternative not increasing distance. No forced move prohibition (some retreats are needed in Quoridor). Existing d7/c7 and test suite passed. Four fresh games: Sigma1 2 wins, Sigma2 2 wins, none cut off at 200, four distinct games. However the guard activated ZERO times and the stored game-2 snapshot series also showed zero activations (current engine independently recommended other moves at the historical positions). Thus there is no demonstrated correction of the original 136-ply problem.

## Deployment decision
The experimental guard is available only with SIGMA2_PRECOMMIT_RETREAT=1, off by default. Avoid an untested change to playing strength. This is explicitly an *incomplete* fix.

## Required next check
Build a repeatable continuous rollout from the saved state just BEFORE ply 22 using exact matched model, random seed and both engines, then confirm cycle formation; test the intervention on that control and compare paired full games. A successful regression must demonstrate a correction in this continuous rollout, not merely print a different independent recommendation. Longer-horizon wall-inclusive opponent replies may be required.
