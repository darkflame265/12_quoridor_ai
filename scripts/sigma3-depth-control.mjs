import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {legal} from '../src/engine.js';
const deep=JSON.parse(readFileSync('evaluation/sigma3-diverse-deep-audit.json','utf8'));
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
process.env.SIGMA3_RESEARCH_SIMS='0';
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
process.env.SIGMA3_FOCUS='0';
const agent=new SigmaProcess({variant:'sigma3'});
const report={version:'sigma3-depth-controlled-v1',source:'evaluation/sigma3-diverse-deep-audit.json',baseline:'sigma3 200',deep:'sigma3 1200',positions:[]};
try{
for(const p of deep.positions){
 const fixture=fixtures[p.id],r=await agent.search({...fixture.s,historyStates:fixture.history.slice(-48)});
 if(!legal(fixture.s,r.pv[0]))throw Error('Illegal at '+p.id);
 const rec={id:p.id,phase:p.phase,sigma2At200:p.baseline.action,sigma3At200:r.pv[0],sigma3At1200:p.deep.action,rootLeaderAt200:r.diagnostics?.rootChildren?.[0]?.action,rootLeaderAt1200:p.deep.root?.[0]?.action,changesWithinSigma3:JSON.stringify(r.pv[0])!==JSON.stringify(p.deep.action),sigma3DiffersFromSigma2At200:JSON.stringify(r.pv[0])!==JSON.stringify(p.baseline.action)};
 report.positions.push(rec);
 writeFileSync('evaluation/sigma3-depth-controlled-audit.json',JSON.stringify(report,null,2));
 console.log('position',p.id,'200',JSON.stringify(rec.sigma3At200),'1200',JSON.stringify(rec.sigma3At1200),'changed',rec.changesWithinSigma3);
}
}finally{await agent.close();}
console.log('SUMMARY',JSON.stringify({positions:report.positions.length,changesWithinSigma3:report.positions.filter(x=>x.changesWithinSigma3).length,diff200:report.positions.filter(x=>x.sigma3DiffersFromSigma2At200).length}));
