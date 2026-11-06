import {SigmaProcess} from '../server/sigma-process.mjs';
import {readFileSync} from 'node:fs';
const f=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const id=17, s=f[id].s; 
for(const mode of [{det:'1',expl:'0'}, {det:'0',expl:'0.2'}]){
 const rows=[];
 for(let seed=1;seed<=8;seed++){
  process.env.SIGMA2_DETERMINISTIC=mode.det;
  process.env.SIGMA_EXPLORATION=mode.expl;
  process.env.SIGMA_SEED=String(20261103+seed*10007);
  process.env.SIGMA2_REUSE='0';
  const worker=new SigmaProcess({variant:'sigma2'});
  try{let r=await worker.search({...s,historyStates:f[id].history.slice(-48)});rows.push({seed,move:r.pv[0]});}
  finally{await worker.close();}
 }
 console.log('PROBE',mode,JSON.stringify(rows),'unique',new Set(rows.map(x=>JSON.stringify(x.move))).size);
}
