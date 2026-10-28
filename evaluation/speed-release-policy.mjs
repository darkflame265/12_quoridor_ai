export function assessSpeed(validation,holdout,benchmark){
 const complete=r=>r?.status==='completed'&&r.games.length===r.pairs*4&&r.games.every(g=>g.replayValidated)&&['general','maze'].every(s=>Array.from({length:r.pairs},(_,i)=>[0,1].every(side=>r.games.filter(g=>g.suite===s&&g.openingIndex===i&&g.candidateSide===side).length===1)).every(Boolean));
 const positive=r=>r?.summary.win>r?.summary.loss;
 const suites=r=>['general','maze'].every(s=>r.games.filter(g=>g.suite===s&&g.result==='win').length>=r.games.filter(g=>g.suite===s&&g.result==='loss').length);
 const fixed=benchmark?.fixed??[];
 const checks={completed:complete(validation)&&complete(holdout),samples:validation?.games.length>=100&&holdout?.games.length>=16,
  separateSplits:validation?.split==='validation'&&holdout?.split==='holdout',
  sameCandidate:!!validation?.identity&&JSON.stringify(validation.identity)===JSON.stringify(holdout?.identity)&&JSON.stringify(validation.identity)===JSON.stringify(benchmark?.identity)&&validation.baselineBinary===holdout?.baselineBinary&&validation.baselineBinary===benchmark?.baselineBinary,
  conditions:[validation,holdout].every(r=>r?.ms===500&&r?.cores===4&&r?.maxPlies===180&&r?.cohort==='search65-v1'),
  validationPositive:positive(validation),holdoutPositive:positive(holdout),suites:[validation,holdout].every(r=>r&&suites(r)),
  tactics:[validation,holdout].every(r=>r?.tactics.length===16&&r.tactics.every(t=>t.pass)),
  deadline:[validation,holdout].every(r=>r?.timing.candidate.moves>0&&r.timing.candidate.overruns/r.timing.candidate.moves<.05),
  fixedParity:fixed.length>=50&&fixed.every(r=>r.original.depth===r.optimized.depth&&r.original.score===r.optimized.score&&r.original.nodes===r.optimized.nodes&&JSON.stringify(r.original.pv)===JSON.stringify(r.optimized.pv)),
  fixedSpeed:benchmark?.summary.fixedOptimizedMs<benchmark?.summary.fixedOriginalMs};
 return {eligible:Object.values(checks).every(Boolean),checks};
}
