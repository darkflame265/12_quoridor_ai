import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
import{SigmaProcess}from'../server/sigma-process.mjs';
import{clone,apply,legal,distance,notation}from'../src/engine.js';
import{createRng,chooseVaried}from'./sigma3-stochastic-policy.mjs';
import{directWallThreat}from'./sigma3-wall-threat-probe.mjs';
const root=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8')).find(x=>x.id===103);
const branch=JSON.parse(readFileSync('evaluation/sigma3-fixture103-reply-depth16.json','utf8')).branches[0];
let state=apply(clone(root.s),branch.forcedAction),history=[...root.history.slice(-47),clone(root.s)];
for(let i=0;i<13;i++){const r=branch.replies[i];if(!legal(state,r.chosen))throw Error('illegal setup');history.push(clone(state));state=apply(state,r.chosen);}
if(state.turn!==root.s.turn)throw Error('wrong turn');
const search=JSON.parse(readFileSync('evaluation/sigma3-fixture103-pretrap-threat-choices.json','utf8'));
const actions=[0,1,5].map(i=>search.candidates[i].action);
if(actions.some(a=>!legal(state,a)))throw Error('illegal candidate');
const tasks=actions.flatMap((action,choice)=>[0,1,2].map(seed=>({choice,seed,action})));
const path='evaluation/sigma3-fixture103-pretrap-counterfactual-outcomes.json';
const report={version:'sigma3-fixture103-pretrap-counterfactual-v1',rootId:103,searchSims:200,
 forcedAlternatives:actions.map(a=>notation(a)),games:tasks.length,results:[]};
if(existsSync(path)){const old=JSON.parse(readFileSync(path,'utf8'));if(old.version!==report.version||old.games!==report.games)throw Error('incompatible resume');report.results=old.results;}
process.env.SIGMA_DIAGNOSTICS='1';process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';process.env.SIGMA2_REUSE='0';
async function play(i){
 const task=tasks[i],after=apply(clone(state),task.action);
 const threat=directWallThreat(after,root.s.turn,{topK:1});
 const rng=createRng(20261104+103*100021+task.seed*10177);
 let s=after,h=[...history.slice(-47),clone(state)],plies=0,diverted=0,seq=[];
 const players=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 try{
  while(s.winner===null&&plies<120){
   const result=await players[s.turn].search({...s,historyStates:h.slice(-48)});
   const choice=chooseVaried(s,result,rng);
   if(!legal(s,choice.action))throw Error('illegal reply');
   if(choice.diverted)diverted++;
   seq.push(JSON.stringify(choice.action));
   h.push(clone(s));s=apply(s,choice.action);plies++;
  }
  const row={choice:task.choice,seed:task.seed,forcedAction:task.action,
   win:s.winner===root.s.turn,loss:s.winner===1-root.s.turn,
   cutoff:s.winner===null,plies,diverted,threatAfterForced:threat.maxOwnIncrease,
   sequenceHash:createHash('sha256').update(seq.join(';')).digest('hex'),
   finalDistances:[distance(s,0),distance(s,1)]};
  console.log('GAME',i+1,'/',tasks.length,notation(task.action),'seed',task.seed,'won',row.win,'plies',plies,'diverted',diverted);
  return row;
 }finally{await Promise.all(players.map(w=>w.close()))}
}
for(let i=report.results.length;i<tasks.length;i+=3){
 const rows=await Promise.all(Array.from({length:Math.min(3,tasks.length-i)},(_,j)=>play(i+j)));
 report.results.push(...rows);writeFileSync(path,JSON.stringify(report,null,2));
 console.log('SAVED',report.results.length);
}
console.log('SUMMARY',JSON.stringify(actions.map((a,i)=>({action:notation(a),wins:report.results.filter(x=>x.choice===i&&x.win).length}))));
