import{readFileSync,writeFileSync}from'node:fs';
import{notation}from'../src/engine.js';
import{conservativeTacticalChoice}from'./sigma3-response-search-experiment.mjs';
const inputs=[
 ['evaluation/sigma3-unseen-middle-audited.json',null],
 ['evaluation/sigma3-independent-middle-fixtures.json',null],
 ['evaluation/sigma3-active-middle-selected.json',null]
];
const dataset=[];
for(const [path]of inputs){
 for(const root of JSON.parse(readFileSync(path,'utf8'))){
  if(!root.rootCandidates?.length)continue;
  dataset.push(root);
 }
}
const params={maxQGap:.15,maxQPenalty:.10,minimumVisits:15,minimumTacticalGain:.8,
 attackBeam:6,defenderBeam:4,wallRiskWeight:.35};
const rows=[];
for(const root of dataset){
 const start=performance.now();
 const result=conservativeTacticalChoice(root.s,{
  pv:[root.rootCandidates[0].action],
  diagnostics:{rootChildren:root.rootCandidates}
 },params);
 rows.push({id:root.id,base:notation(root.rootCandidates[0].action),
  chosen:notation(result.action),changed:result.changed,
  gain:result.tacticalImprovement,
  skipped:result.reason,
  elapsedMs:Math.round(performance.now()-start)});
 console.log('ROOT',root.id,'base',rows.at(-1).base,'chosen',rows.at(-1).chosen,
  'gain',result.tacticalImprovement?.toFixed(2)||'n/a',
  'elapsed',rows.at(-1).elapsedMs);
}
const report={version:'sigma3-response-search-isolated-root-sweep-v1',
 params,positions:rows.length,changes:rows.filter(r=>r.changed),
 rows,productionEnabled:false};
writeFileSync('evaluation/sigma3-response-search-isolated-root-sweep.json',JSON.stringify(report,null,2));
console.log('CHANGES',JSON.stringify(report.changes));
