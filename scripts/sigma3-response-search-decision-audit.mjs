import{readFileSync,writeFileSync}from'node:fs';
import{clone,apply,legal,notation}from'../src/engine.js';
import{opponentResponseSearch,conservativeTacticalChoice}from'./sigma3-response-search-experiment.mjs';
const cases=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8')).filter(x=>[101,103,105].includes(x.id));
const report={version:'sigma3-response-search-decision-audit-v1',conditions:{attackBeam:6,defenderBeam:4,wallRiskWeight:.35},cases:[]};
for(const row of cases){
 const t=performance.now();
 const candidates=row.rootCandidates.slice(0,3).map(c=>({
  action:c.action,notation:notation(c.action),visits:c.visits,q:c.qFromRoot,
  tactic:opponentResponseSearch(row.s,row.s.turn,c.action)
 }));
 const search={pv:[row.rootCandidates[0].action],
  diagnostics:{rootChildren:row.rootCandidates}};
 const adapted=conservativeTacticalChoice(row.s,search);
 const detail={id:row.id,side:row.s.turn,elapsedMs:performance.now()-t,
  candidates:candidates.map(c=>({...c,tactic:{
   worstCase:c.tactic.worstCase,static:c.tactic.originalStatic,
   wallRisk:c.tactic.opponentOneWallRisk,
   examined:c.tactic.examinedOpponentResponses,
   worstResponse:c.tactic.responses[0]}})),
  adaptedChoice:notation(adapted.action),changed:adapted.changed,
  reason:adapted.reason,adaptedDelta:adapted.tacticalImprovement,
  adaptedTimeMs:adapted.elapsedMs};
 report.cases.push(detail);
 console.log('CASE',row.id,'time',Math.round(detail.elapsedMs),
  'candidates',candidates.map(c=>[c.notation,c.q.toFixed(3),c.tactic.worstCase.toFixed(2)]),
  'choice',detail.adaptedChoice,detail.reason);
 writeFileSync('evaluation/sigma3-response-search-decision-audit.json',JSON.stringify(report,null,2));
}
