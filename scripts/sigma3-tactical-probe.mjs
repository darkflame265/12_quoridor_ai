import {readFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-tactical-fixtures.json','utf8'));
const games=JSON.parse(readFileSync('reports/sigma-selfplay/sigma2-wallvalue-trial-24.json','utf8')).completed;
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
for(const i of [1,2,3,5]){
 const f=fixtures[i],history=games[f.game].trace.slice(Math.max(0,f.ply-48),f.ply).map(x=>x.state);
 for(const flag of ['0','1']){
  process.env.SIGMA3_TACTICAL_PROOF=flag;
  const w=new SigmaProcess({variant:'sigma3'});
  try{
   const r=await w.search({...f.state,historyStates:history});
   console.log('fixture',i,'flag',flag,'move',JSON.stringify(r.pv[0]),'proof',JSON.stringify(r.diagnostics?.loopDebug?.sigma3TacticalProof),'ms',Math.round(r.elapsedMs));
  }finally{await w.close()}
 }
}
