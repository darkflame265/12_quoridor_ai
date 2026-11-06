import {SigmaProcess} from '../server/sigma-process.mjs';
import {readFileSync} from 'node:fs';
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
process.env.SIGMA_DIAGNOSTICS='1';process.env.SIGMA_EXPLORATION='0';process.env.SIGMA2_DETERMINISTIC='1';process.env.SIGMA2_REUSE='0';
for(const id of [15,17,19,24,26,32,33]){
 const f=fixtures[id]; const proc=new SigmaProcess({variant:'sigma2'});
 try{
  const r=await proc.search({...f.s,historyStates:f.history.slice(-48)});
  console.log('ROOT',id,'selected',JSON.stringify(r.pv[0]),'top',JSON.stringify(r.diagnostics?.rootChildren?.slice(0,4).map(x=>({a:x.action,n:x.visits,q:x.qFromRoot}))));
 }finally{await proc.close()}
}
