import {readFileSync,writeFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync('evaluation/'+n,'utf8'));
const audit=read('sigma4-v3-separated-candidates-audit-20261106.json');
const screen=read('sigma4-v3-historical-root-regression-20261106.json');
const holdout=read('sigma4-v3-finalist-independent-holdout-20261106.json');
const name={'baseline':'Production weighted V3','safety-v3':'A: one-reply proof-based safety',
 'reply-v5':'B: additional native opponent reply',
 'conservative-weights':'C: conservative root weights'};
const fmt=x=>Number(x).toFixed(1);
const rows=audit.candidatePolicies.map(k=>{
 const v=audit.outcomes[k],lat=audit.latency[k],p=audit.pairwise[k];
 return '| '+name[k]+' | '+v.wins+'/'+v.games+' | '+v.versusSigma2.wins+'/'+v.versusSigma2.games+
  ' | '+v.versusSigma3.wins+'/'+v.versusSigma3.games+
  ' | '+fmt(lat.meanMs)+' | '+fmt(lat.p95Ms)+' | '+lat.over500+'/'+lat.moves+' | '+
  (p?('+'+p.improved+' / -'+p.regressed):'control')+' |';
});
const paired=Object.entries(audit.pairwise).map(([k,p])=>'- '+name[k]+': '+p.paired+
 ' matched scenario comparisons, '+p.improved+' wins gained, '+p.regressed+' wins lost, '+
 p.unchanged+' unchanged. '+p.sequenceChanged+' changed full-game sequences. Pilot advancement '+
 (p.candidateCanAdvance?'yes':'no')+'.');
const report=[
 '# Sigma4 V3: isolated tactical, reply-search and weighted-choice trials',
 '',
 'Date: 2026-11-06. Production weighted Sigma4 V3 was deliberately NOT replaced.',
 '',
 '## Baseline and reproducibility',
 '',
 'The frozen reference is the real deployed weighted-root V3 with 200-simulation bitset-wall MCTS, original ONNX and the current state/history-seeded RNG. It has weighted root settings rate .72, temperature 1.2, qTemperature .15, maxQDrop .15, minVisits 5 and minVisitRatio .06.',
 'Every variant uses the same base neural model and simulations. The original root-selection code and policy seeds are preserved for the baseline. Opponent Sigma2 source was already user-modified and its exact SHA-256 is pinned in the match JSON.',
 '',
 '## Previous failure evidence',
 '',
 'Earlier 028/040 alternative-pawn and wall counterfactuals produced no improved wins. The correction ONNX had worse strong-policy validation and lost 8:12 in direct matched head-to-head, so model replacement is not part of this experiment.',
 'Replayed '+screen.all.decisions+' real historical root decisions. Under current deployment RNG, safety wrapper changed '+
 screen.all.safetyChanges+' decisions while conservative weights changed '+screen.all.cautiousChanges+
 '. Baseline choices exposed immediate next-ply goal in '+screen.all.immediateLossExposures+
 ' fixed historical positions. Verified wrapper found '+screen.all.safetyPreventedImmediateLoss+
 ' alternative safe actions in those situations. Historical replay is not counterfactual game outcome evidence.',
 '',
 '## Independent interventions',
 '',
 '- A: only direct own-goal wins and checked legal opponent next-goal prevention; existing V3 helper.',
 '- B: safe V3 plus an extra 200-simulation opponent reply gate after non-native weighted moves; existing V5 helper.',
 '- C: weighted-root rate reduced from .72 to .55, temperature 1.2 to .9, qTemperature .15 to .12, maxQDrop .15 to .10.',
 'These three variants were NEVER combined. Earlier failed 3-ply deployment and original best.onnx were left untouched.',
 '',
 '## Paired pilot: 4 positions, both seats, two opponents, 64 finished games',
 '',
 '| Version | Wins | Sigma2 wins | Sigma3 wins | mean ms | p95 ms | >500ms | Gains / regressions vs baseline |',
 '|---|---:|---:|---:|---:|---:|---:|---|',
 ...rows,
 '',
 ...paired,
 '',
 'Four source starting positions include two previously audited error cases and two MCTS-sourced midgames. All 64 games were replayed for every legal action and final winner. Results are repeated scenarios, NOT 64 independent trials or statistical proof of strength.',
 '',
 '## Untouched holdout gate',
 '',
 'The additional holdout includes three other MCTS-generated source trajectories and can run only if one candidate first shows positive net matched gains, does not lose versus either opponent and does not worsen pilot p95. The holdout itself does not choose a finalist.',
 '',
 'Holdout decision: '+holdout.summary.decision+'.',
 holdout.summary.reason??('Candidate '+holdout.summary.finalist+
 ', holdout wins '+holdout.summary.finalistWins+
 ' versus baseline '+holdout.summary.baselineWins+
 ', '+holdout.summary.matchedGames+' matched conditions.'),
 '',
 '## Release decision',
 '',
 '**Production promotion: REJECTED.** No candidate may be installed without larger fresh group-aware win evidence, sufficient direct strength against Sigma2/Sigma3, and deadline tests. Regression and exploratory evidence can be retained without user-facing risk.',
 '',
 '### Runbook',
 '',
 '- node scripts/sigma4-v3-historical-root-screen.mjs',
 '- node scripts/sigma4-v3-candidate-paired-pilot.mjs',
 '- node scripts/sigma4-v3-separated-candidates-audit.mjs',
 '- node scripts/sigma4-v3-finalist-independent-holdout.mjs',
 '- node scripts/sigma4-v3-pilot-report.mjs',
 '',
 'The runner writes complete legal move histories, full source hashes, candidate decisions and search latencies into evaluation/sigma4-v3-*.json files. Existing user-dirty files remain untouched.',
 ''
].join('\n');
writeFileSync('docs/SIGMA4_V3_CANDIDATE_PAIRED_RESEARCH_20261106.md',report);
console.log('PASS report created',audit.completeGames,holdout.summary.decision);
