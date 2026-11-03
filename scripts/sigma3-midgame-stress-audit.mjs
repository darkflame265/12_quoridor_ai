import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {legal} from '../src/engine.js';
const all=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const ids=all.map((f,i)=>({f,i})).filter(x=>x.f.phase==='middle').map(x=>x.i);
process.env.SIGMA_EXPLORATION='0';process.env.SIGMA2_DETERMINISTIC='1';process.env.SIGMA2_REUSE='0';process.env.SIGMA_DIAGNOSTICS='1';
const result={version:'sigma3-midgame-stress-audit-v1',positions:[]};
for(const id of ids){
 const f=all[id],row={id,phase:f.phase,ply:f.ply,wallCount:f.s.walls.length};
 for(const enabled of [false,true]){
  process.env.SIGMA3_MIDGAME_STRESS=enabled?'1':'0';
  const worker=new SigmaProcess({variant:'sigma3'});
  try{
   const r=await worker.search({...f.s,historyStates:f.history.slice(-48)});
   if(!legal(f.s,r.pv[0]))throw Error('illegal '+id);
   row[enabled?'on':'off']={action:r.pv[0],value:r.value,ms:r.elapsedMs,stress:r.diagnostics?.loopDebug?.sigma3MidgameStress,visits:r.diagnostics?.rootChildren?.slice(0,4)};
  }finally{await worker.close()}
 }
 row.changed=JSON.stringify(row.off.action)!==JSON.stringify(row.on.action);
 result.positions.push(row);
 writeFileSync('evaluation/sigma3-midgame-stress-audit.json',JSON.stringify(result,null,2));
 console.log('position',id,'walls',row.wallCount,'changed',row.changed,'baseline',JSON.stringify(row.off.action),'trial',JSON.stringify(row.on.action),'stress',JSON.stringify(row.on.stress));
}
console.log('SUMMARY',JSON.stringify({positions:result.positions.length,changes:result.positions.filter(r=>r.changed).length,avgOverheadMs:Math.round(result.positions.reduce((s,r)=>s+r.on.ms-r.off.ms,0)/result.positions.length)}));
