export function assessGuardDevelopment(report,proof){
 const c=report?.summary??{},groups=['general','maze'];
 const paired=report&&groups.every(s=>Array.from({length:report.pairs},(_,i)=>[0,1].every(side=>report.games.filter(g=>g.suite===s&&g.openingIndex===i&&g.candidateSide===side).length===1)).every(Boolean));
 const checks={completed:report?.status==='completed',samples:(report?.games.length??0)>=12,paired,
  control:report?.baseline==='speed'&&JSON.stringify(report.baselineIdentity)===JSON.stringify(proof?.speedIdentity),
  sameCandidate:!!proof?.identity&&JSON.stringify(report?.identity)===JSON.stringify(proof.identity),
  conditions:report?.ms===500&&report?.cores===4&&report?.maxPlies===180&&report?.cohort==='search67-v1',
  fixedReferences:proof?.summary.fixedChecks>=24&&proof.summary.allFixedScoresMovesNodesMatch===true,
  positive:c.win>c.loss,
  suites:!!report&&groups.every(s=>report.games.filter(g=>g.suite===s&&g.result==='win').length>=report.games.filter(g=>g.suite===s&&g.result==='loss').length),
  tactics:report?.tactics.length===16&&report.tactics.every(t=>t.pass),deadline:report?.timing.candidate.moves>0&&report.timing.candidate.overruns/report.timing.candidate.moves<.05};
 return {advanceToValidation:Object.values(checks).every(Boolean),checks,productionActive:false};
}
