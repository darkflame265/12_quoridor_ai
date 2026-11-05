# SIGMA4 native search budget study ºw^~)Þt 2026-11-05

## Scope
Research-only benchmarking and hard-stop experiment. The live website's Sigma2, Sigma3, Sigma4 and default engine were NOT modified. Existing uncommitted changes are preserved. Frozen model and existing policy used; only the offline Sigma3 research worker simulation count changes.

## Warm-worker wall time vs number of simulations
Three positions (starting, pawn-shift, wall-shift), one measurement each per budget:
- **50 simulations**: mean 161.9ms; range 152.5171.5ms; 3/3 under 500ms.
- **100 simulations**: mean 299.9ms; range 299.1300.3ms; 3/3 under 500ms.
- **200 simulations**: mean 570.2ms; range 564.7575.0ms; 0/3 under 500ms.
Worker loading/startup excluded, wall times include serialization and calls.

## ONNX inference profile (100 simulations)
Three positions: engine compute 269.5, 285.7, 315.6ms. Network inference called **102 times** per position; ONNX run consumed respectively 154.8, 153.7, 163.9ms (**57.5%, 53.8%, 51.9%** of engine time). Remaining time is game-state and search overhead, including Python logic. This instrumentation does not separate every search stage, and profiling adds small overhead.

## Pilot strength assessment
Four matches on two existing recorded opening fixtures; both seats swapped. Weighted Sigma3 at **100 simulations: 2w2L** head-to-head with weighted Sigma3 at **200 simulations: 2Wºw^~)Þw2L**. No draws, all games completed. These are previously inspected fixtures and cannot establish equal strength or superiority. No genuine holdout or confidence bound from just four games.

## Hard interruption
Research-only `scripts/sigma4-budget-process.mjs` supports configurable simulations and `searchWithDeadline(...,{deadlineMs})` which stops and kills its **own isolated Python process** at timeout and allows recreation. It does not fabricate a legal move on timeout.
- A deliberately timed-out worker was interrupted after about **53ms** for a 40ms deadline, then successfully restarted and searched at 50 simulations.
- At nominal 500ms: 100 simulations successfully returned at **302ms, 289ms**. 200 simulations timed out and stopped at **509ms, 517ms**.
- These results do not prove strict real-time 500ms completion, nor is timeout code integrated in the live site. Startup, CPU contention, other board positions, OS timer precision and multi-core load may change latency. Process kill discards any current search tree.

## Research assets
- `scripts/sigma4-budget-process.mjs`: isolated worker process with adjustable 1200 simulations, experimental timeout + process termination.
- `scripts/sigma4-budget-benchmark.mjs`: 3-position wall time comparison.
- `scripts/sigma4-budget-strength-pilot.mjs`: seat-swapped 100-vs-200 weighted research matches.
- `scripts/sigma4-profile-worker.py`: copied and instrumented worker, NOT the original Python worker.
- `scripts/sigma4-onnx-profile.mjs`: ONNX inference call/time profile.
- `scripts/sigma4-hard500-check.mjs` and `scripts/test_sigma4_budget_deadline.mjs`: nominal 500ms interrupt and restart.
- `evaluation/sigma4-budget-benchmark-20261105.json`
- `evaluation/sigma4-budget-100-vs-200-20261105.json`
- `evaluation/sigma4-onnx-profile-20261105.json`
- `evaluation/sigma4-hard500-check-20261105.json`

## Promotion gate / next research
Do not replace the current engine on this evidence. Test 100 simulations on many **untouched, seat-swapped** legal opening, middlegame and wall fixtures against both Sigma2 and Sigma3 and an unchanged 200-simulation Sigma4 weighted policy. Include median, p95/p99 warm and cold worker latency and actual full decision times. Build a worker protocol with cooperative cancellation or a safe stateful worker pool if fast restart becomes expensive; never silently return an unverified move at timeout. Investigate reducing ONNX per-node cost and caching when repeated states are genuinely present, without conflating simulation budget reduction with an unproven strength improvement.
