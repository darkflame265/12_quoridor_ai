import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
import{SigmaProcess}from'../server/sigma-process.mjs';
import{clone,apply,legal}from'../src/engine.js';
import{createRng,chooseVaried}from'./sigma3-stochastic-policy.mjs';
const roots=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8')).filter(f=>[101,103,105].includes(f.id));
const tasks=roots.flatMap(f=>[0,1].flatMap(choice=>[2,3,4].map(seed=>({id:f.id,choice,seed}))));
const file='evaluation/sigma3-hard-example-repeated-rollouts.json';
const report={version:'sigma3-hard-example-repeated-v1',rootIds:roots.map(x=>x.id),seedBase:20261104,games:tasks.length,results:[]};
if(existsSync(file)){
 const previous=JSON.parse(readFileSync(file,'utf8'));
 if(previous.version!==report.version||previous.games!==report.games)throw Error('resume mismatch');
 report.results=previous.results;
}
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
async function play(i){
 const t=tasks[i],f=roots.find(x=>x.id===t.id);
 const action=f.rootCandidates[t.choice].action;
 if(!legal(f.s,action))throw Error('illegal initial '+i);
 const rng=createRng(20261104+f.id*100021+t.seed*10177);
 let s=apply(clone(f.s),action),history=[...f.history.slice(-47),clone(f.s)];
 let plies=0,diverted=0,eligible=0,actions=[];
 const workers=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 try{
  while(s.winner===null&&plies<120){
   const response=await workers[s.turn].search({...s,historyStates:history.slice(-48)});
   const pick=chooseVaried(s,response,rng);
   if(!legal(s,pick.action))throw Error('illegal branch '+i+' '+plies);
   eligible+=+(pick.eligible>0);diverted+=+pick.diverted;
   actions.push(JSON.stringify(pick.action));
   history.push(clone(s));s=apply(s,pick.action);plies++;
  }
  const row={...t,rootSide:f.s.turn,rootAction:action,win:s.winner===f.s.turn,
   loss:s.winner===1-f.s.turn,cutoff:s.winner===null,plies,diverted,eligible,
   sequenceHash:createHash('sha256').update(actions.join(';')).digest('hex')};
  console.log('GAME',i+1,'/',tasks.length,'id',t.id,'candidate',t.choice,'seed',t.seed,'win',row.win,'plies',plies,'varied',diverted);
  return row;
 }finally{await Promise.all(workers.map(w=>w.close()))}
}
for(let i=report.results.length;i<tasks.length;i+=4){
 const batch=Array.from({length:Math.min(4,tasks.length-i)},(_,j)=>i+j);
 const rows=await Promise.all(batch.map(play));
 report.results.push(...rows);writeFileSync(file,JSON.stringify(report,null,2));
 console.log('SAVED',report.results.length);
}
const summary=roots.map(f=>{
 const a=report.results.filter(r=>r.id===f.id&&r.choice===0);
 const b=report.results.filter(r=>r.id===f.id&&r.choice===1);
 return {id:f.id,aWins:a.filter(r=>r.win).length,bWins:b.filter(r=>r.win).length};
});
console.log('SUMMARY',JSON.stringify(summary));
