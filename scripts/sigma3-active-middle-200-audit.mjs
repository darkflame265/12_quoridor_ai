import{readFileSync,writeFileSync}from'node:fs';
import{SigmaProcess}from'../server/sigma-process.mjs';
import{legal}from'../src/engine.js';
const file='evaluation/sigma3-active-middle-fixtures.json';
const rows=JSON.parse(readFileSync(file,'utf8'));
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
process.env.SIGMA_DIAGNOSTICS='1';
for(let i=0;i<rows.length;i+=4){
 const batch=await Promise.all(rows.slice(i,i+4).map(async f=>{
  const worker=new SigmaProcess({variant:'sigma2'});
  try{
   const result=await worker.search({...f.s,historyStates:f.history.slice(-48)});
   const next=result.diagnostics?.rootChildren?.slice(0,2);
   if(!next||next.length!==2||!next.every(c=>legal(f.s,c.action)))throw Error('missing root '+f.id);
   return {...f,historicalRootCandidates:f.rootCandidates,rootCandidates:next,
           selected200:result.pv[0],simulations200:result.simulations};
  }finally{await worker.close()}
 }));
 rows.splice(i,batch.length,...batch);
 writeFileSync(file,JSON.stringify(rows,null,2));
 for(const f of batch)console.log('AUDIT',f.id,'sim',f.simulations200,'visits',f.rootCandidates.map(c=>c.visits),
  'q',f.rootCandidates.map(c=>c.qFromRoot),'chosen',JSON.stringify(f.selected200));
}
