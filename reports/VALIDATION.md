# Atlas 2 validation — 2026-10-27 (Asia/Seoul)

## Equal per-move budget, paired colors

| Snapshot | Budget | Games | Atlas wins | Legacy wins | Draws |
|---|---:|---:|---:|---:|---:|
| Initial rewrite | 100 ms | 8 | 3 | 5 | 0 |
| Tactical/evaluation tuning | 100 ms | 8 | 4 | 4 | 0 |
| Tactical/evaluation tuning | 500 ms | 8 | 5 | 3 | 0 |
| Faster legal move ordering, separate seed 831027 | 100 ms | 12 | 8 | 4 | 0 |

The last run uses a separate seed after tuning. 8/12 is 66.7%; a Wilson 95% interval is approximately 39%–86%. This small sample is evidence of progress, not a statistically decisive superiority claim or a superhuman-strength result. Do not combine these rows as an independent sample: earlier rows informed changes. Starting-position pair 1 is shared across seeds.

`benchmark-latest.json` contains complete game records, actual time, search nodes and the source SHA-256 at process startup. The source subsequently received a statistics-only change to count endgame table states instead of reporting zero nodes. Earlier snapshots are retained in separate JSON files. No games were excluded from the summaries.

Each engine has the same requested time limit. Immediate wins and solved endings may stop early; the legacy engine can exceed the budget while generating a batch of candidates. Actual time is recorded rather than assumed equal. Threefold repetition or a ply cap is a benchmark draw convention only. Fixed-seed openings do not make time-limited results deterministic under different CPU load.

## Correctness and integration

- Independent optimized/reference move and wall legality comparison over 8 seeded games, up to 55 plies each.
- All legal moves remain present in search ordering; search ordering restores the state.
- Incremental hash and edges checked after make/unmake.
- Immediate wins for both colors, jump finish and emergency defense.
- Time cancellation and subsequent search; returned principal variation legality.
- Fixed-maze retrograde endgame solver checked against minimax outcomes for every nonterminal empty-board pawn placement and both turns; maze legality smoke test.
- Both player viewpoints and all square/wall coordinate round trips.
- Browser verified the live user's existing wall-free game can display Atlas 2 exact endgame advice without changing the game record.

## Current limitations

No Rust toolchain is installed; the new engine runs in a browser Worker with typed arrays. Rust/WASM migration, neural policy/value models, GPU self-play training, and independent expert-engine/human evaluation are not implemented. General positions use selective depth reductions and heuristic evaluation; only completed wall-free endgame retrograde results are labeled exact.
