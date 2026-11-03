import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {legal,distance} from '../src/engine.js';
const all=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const ids=[8,12,16,20,24,28,32,36,40,44,46,48];
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
process.env.SIGMA3_FOCUS='0';
const baseline=new SigmaProcess({variant:'sigma2'});
process.env.SIGMA3_RESEARCH_SIMS='1200';
const deep=new SigmaProcess({variant:'sigma3'});
const report={version:'sigma3-diverse-deep-audit-v1',fixtures:'evaluation/sigma3-diverse-match-fixtures.json',ids,baselineSims:200,researchSims:1200,deterministic:true,reusedTree:false,positions:[]};
try{
 for(const id of ids){
  const p=all[id],s={...p.s,historyStates:p.history.slice(-48)};
  const b=await baseline.search(s),d=await deep.search(s);
  if(!legal(s,b.pv[0])||!legal(s,d.pv[0]))throw Error('illegal action');
  const rec={id,phase:p.phase,ply:p.ply,baseline:{action:b.pv[0],value:b.value,ms:b.elapsedMs,root:b.diagnostics?.rootChildren?.slice(0,8)},deep:{action:d.pv[0],value:d.value,ms:d.elapsedMs,root:d.diagnostics?.rootChildren?.slice(0,8)},changed:JSON.stringify(b.pv[0])!==JSON.stringify(d.pv[0]),distances:[distance(s,0),distance(s,1)]};
  report.positions.push(rec);
  writeFileSync('evaluation/sigma3-diverse-deep-audit.json',JSON.stringify(report,null,2));
  console.log('position',id,p.phase,'changed',rec.changed,'s2',JSON.stringify(rec.baseline.action),'deep',JSON.stringify(rec.deep.action),'ms',Math.round(d.elapsedMs));
 }
}finally{await baseline.close();await deep.close();}
console.log('SUMMARY',JSON.stringify({positions:report.positions.length,changed:report.positions.filter(x=>x.changed).length}));
