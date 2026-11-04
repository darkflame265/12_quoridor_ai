import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {legal,clone,distance} from '../src/engine.js';
const file='evaluation/sigma3-unseen-middle-roots.json';
const rows=JSON.parse(readFileSync(file,'utf8'));
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
process.env.SIGMA_DIAGNOSTICS='1';
let output=[];
for(let start=0;start<rows.length;start+=4){
 const chunk=rows.slice(start,start+4);
 const found=await Promise.all(chunk.map(async f=>{
  const p=new SigmaProcess({variant:'sigma2'});
  try{
   const r=await p.search({...f.s,historyStates:f.history.slice(-48)});
   const children=r.diagnostics?.rootChildren?.slice(0,5)||[];
   if(children.length<2||children.some(c=>!legal(f.s,c.action)))throw Error('bad roots '+f.id);
   return {...f,rootCandidates:children,baseline:r.pv[0],dist:[distance(f.s,0),distance(f.s,1)]};
  }finally{await p.close()}
 }));
 output.push(...found);
 writeFileSync('evaluation/sigma3-unseen-middle-audited.json',JSON.stringify(output,null,2));
 for(const row of found)console.log(row.id,row.file,'wall',row.s.walls.length,'d',row.dist,'top',row.rootCandidates.slice(0,3).map(x=>[x.visits,x.qFromRoot,JSON.stringify(x.action)]));
}
