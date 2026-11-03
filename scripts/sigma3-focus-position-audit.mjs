import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
// Experimental search allocation is opt-in; production Sigma3 stays unchanged.
process.env.SIGMA3_FOCUS='1';
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
process.env.SIGMA_EXPLORATION='0.15';
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_SEED='20261103';
const agents=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma3'})];
const results=[];
try{
 for(let i=0;i<24;i++){
  const f=fixtures[(i*2)%fixtures.length];
  const row={index:i,phase:f.phase};
  for(let j=0;j<2;j++){
   const r=await agents[j].search({...f.s,historyStates:f.history.slice(-48)});
   row[j?'sigma3':'sigma2']={action:r.pv[0],elapsedMs:r.elapsedMs,replyAudit:r.diagnostics?.loopDebug?.sigma3ReplyAudit??null,replyGuard:r.diagnostics?.loopDebug?.sigma3ReplyGuard??null};
  }
  results.push(row);
  console.log('POSITION',i+1,'phase',f.phase,'changed',JSON.stringify(row.sigma2.action)!==JSON.stringify(row.sigma3.action),'audited',!!row.sigma3.replyAudit,'guard',!!row.sigma3.replyGuard,'ms',Math.round(row.sigma3.elapsedMs));
 }
} finally {await Promise.all(agents.map(a=>a.close()))}
writeFileSync('evaluation/sigma3-focus-position-audit-24.json',JSON.stringify({version:'bounded-existing-mcts-reply-v1',positions:results},null,2));
console.log('SUMMARY',JSON.stringify({count:results.length,changed:results.filter(r=>JSON.stringify(r.sigma2.action)!==JSON.stringify(r.sigma3.action)).length,audits:results.filter(r=>r.sigma3.replyAudit).length,guards:results.filter(r=>r.sigma3.replyGuard).length,avgSigma3:Math.round(results.reduce((s,r)=>s+r.sigma3.elapsedMs,0)/results.length),avgSigma2:Math.round(results.reduce((s,r)=>s+r.sigma2.elapsedMs,0)/results.length)}));