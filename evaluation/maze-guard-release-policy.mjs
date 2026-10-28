import {assessMazeGuardDevelopment} from './maze-guard-decision.mjs';
const suites=['general','maze'];
function complete(r){return r?.status==='completed'&&Number.isInteger(r.pairs)&&r.games.length===r.pairs*4&&r.games.every(g=>g.replayValidated)&&suites.every(s=>Array.from({length:r.pairs},(_,i)=>[0,1].every(side=>r.games.filter(g=>g.suite===s&&g.openingIndex===i&&g.candidateSide===side).length===1)).every(Boolean));}
export function assessMazeGuardRelease(development,validation,holdout,proof){
 const reports=[validation,holdout],id=JSON.stringify(proof?.identity);
 const checks={development:assessMazeGuardDevelopment(development,proof).advanceToValidation,
  completed:reports.every(complete),samples:(validation?.games.length??0)>=100&&(holdout?.games.length??0)>=16,
  separate:validation?.split==='validation'&&holdout?.split==='holdout'&&validation?.fixtureSeed!==holdout?.fixtureSeed,
  identities:!!proof?.identity&&reports.every(r=>JSON.stringify(r?.identity)===id)&&validation?.baselineBinary===holdout?.baselineBinary,
  conditions:reports.every(r=>r?.baseline==='original'&&r?.cohort==='search68-v1'&&r?.ms===500&&r?.cores===4&&r?.maxPlies===180),
  positive:reports.every(r=>r?.summary.win>r?.summary.loss),
  suites:reports.every(r=>r&&suites.every(s=>r.games.filter(g=>g.suite===s&&g.result==='win').length>=r.games.filter(g=>g.suite===s&&g.result==='loss').length)),
  tactics:reports.every(r=>r?.tactics.length===16&&r.tactics.every(t=>t.pass)),
  deadline:reports.every(r=>r?.timing.candidate.moves>0&&r.timing.candidate.overruns/r.timing.candidate.moves<.05)};
 return {eligible:Object.values(checks).every(Boolean),checks,productionActive:false};
}
