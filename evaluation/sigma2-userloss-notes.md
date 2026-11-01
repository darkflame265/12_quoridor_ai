# Sigma 2 ? user-loss replay follow-up

The attached file `quoridor-game (13).json` contains rebased screen capture segments. Only its **41-action main `records` segment** was extracted into `scripts/analyze-user-sigma-loss.mjs`; the other capture segments must not be concatenated without checking continuity.

## Confirmed replay observations
- All 41 main actions are legal from the standard initial state.
- The final recorded board is **nonterminal**: Sigma-side player 0 is four shortest-path moves from its goal, while the opposing player 1 is one move away. Remaining walls: 3 versus 0.
- At Sigma-side plies 7, 9, 11, 15 and 27, placing a wall changed neither player's shortest-path distance immediately. This is a **screening signal**, not proof that the walls were strategically wrong: defensive and future-connectivity effects remain possible.
- The user's reported loss is credible as context, but the uploaded main segment does **not** contain the terminal winning move.

## Experimental Sigma 2 candidate
- Original Sigma 1 is unchanged; the public `sigma` service remains Sigma 1.
- Sigma 2 continues PUCT 50 with the original ONNX weights, takes an immediate goal move, and considers overriding a wall that has non-positive *immediate relative shortest-path impact*, but only where PUCT visited a pawn move that strictly reduces own shortest-path distance.
- The older unconditional recent-position avoidance has been replaced in the Sigma 2 experimental branch. No neural retraining was attempted.
- The initial 2-game comparison gave Sigma 1 one win and Sigma 2 one win; a second 4-game alternating-side evaluation gave 2 wins each. Both 4-game sequences repeated by side (only 2 unique games). **No strength improvement is established; do not promote.**

## Needed before promotion
1. Calculate counterfactual consequences of the five suspicious walls from the exact replay; evaluate follow-up tactical positions, not just immediate distances.
2. Investigate urgent one-move opponent threats and compare safe blocking walls with pawn moves.
3. Run varied yet standard-opening adversarial matchups with more than two unique games; ensure no regression versus Sigma 1/Atlas.
4. Continue to keep 500ms as an aspiration, not a forced loss. The 30-second stuck-worker watchdog is a separate safety measure.
