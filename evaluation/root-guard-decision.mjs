export function assessRootDevelopment(r,p){
 const modes=['root','tactical'],c=r?.summary??{};
 const checks={completed:r?.status==='completed',samples:(r?.games.length??0)>=12&&r.games.length===r.pairs*4,
  paired:!!r&&['general','maze'].every(s=>Array.from({length:r.pairs},(_,i)=>[0,1].every(side=>r.games.filter(g=>g.suite===s&&g.openingIndex===i&&g.candidateSide===side).length===1)).every(Boolean)),
  mode:modes.includes(r?.mode),control:r?.baseline==='speed'&&JSON.stringify(r.baselineIdentity)===JSON.stringify(p?.speedIdentity),sameCandidate:!!p?.identity&&JSON.stringify(r?.identity)===JSON.stringify(p.identity),
  conditions:r?.split==='development'&&r?.cohort==='search69-v1'&&r?.ms===500&&r?.cores===4&&r?.maxPlies===180,
  references:p?.summary.offParityChecks>=24&&p?.summary.fullParityChecks>=24&&p?.summary.rootDepth3Checks>=12,
  defenses:p?.summary.safetyChecks>=200&&p?.summary.immediateDefensesExact===true,
  positive:c.win>c.loss,suites:!!r&&['general','maze'].every(s=>r.games.filter(g=>g.suite===s&&g.result==='win').length>=r.games.filter(g=>g.suite===s&&g.result==='loss').length),
  tactics:r?.tactics.length===16&&r.tactics.every(t=>t.pass),deadline:r?.timing.candidate.moves>0&&r.timing.candidate.overruns/r.timing.candidate.moves<.05};
 return {advanceToValidation:Object.values(checks).every(Boolean),checks,productionActive:false};
}
export function selectRootCandidate(reports,proof){
 const entries=reports.map(r=>({mode:r.mode,summary:r.summary,...assessRootDevelopment(r,proof)}));
 const eligible=entries.filter(e=>e.advanceToValidation).sort((a,b)=>(b.summary.win-b.summary.loss)-(a.summary.win-a.summary.loss)||b.summary.win-a.summary.win||(a.mode==='root'?-1:1));
 return {entries,selectedMode:eligible[0]?.mode??null,productionActive:false};
}
