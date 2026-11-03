import{readFileSync,writeFileSync,existsSync}from'node:fs';
import{createHash}from'node:crypto';
import{SigmaProcess}from'../server/sigma-process.mjs';
import{clone,apply,legal,distance}from'../src/engine.js';
import{createRng,chooseVaried}from'./sigma3-stochastic-policy.mjs';
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const audit=JSON.parse(readFileSync('evaluation/sigma3-midgame-stress-audit.json','utf8')).positions;
const ids=[15,16,17,19,20,22,23,24,26,28,32,33];
const trials=ids.flatMap(id=>[0,1].flatMap(choice=>[0,1].map(seed=>({id,choice,seed}))));
const out='evaluation/sigma3-midgame-diverse-outcomes.json';
const meta={version:'sigma3-midgame-diverse-v1',policy:'MCTS root visited alternative if visit count >= 17% of leader, min7, qFromRoot within 0.25 of leader; 35% injected choice chance',games:trials.length,positions:ids,seedBase:20261103,simulations:200,results:[]};
if(existsSync(out)){
 const old=JSON.parse(readFileSync(out,'utf8'));
 if(old.version!==meta.version||old.games!==meta.games)throw Error('incompatible resume');
 meta.results=old.results;
}
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
process.env.SIGMA3_FOCUS='0';
async function play(i){
 const {id,choice,seed}=trials[i],f=fixtures[id],row=audit.find(x=>x.id===id);
 const action=row.off.visits[choice].action;
 if(!legal(f.s,action))throw Error('invalid root action');
 const rng=createRng(20261103+id*100021+seed*10177);
 let state=apply(clone(f.s),action),history=[...f.history.slice(-47),clone(f.s)];
 let plies=0,diverted=0,opportunities=0,firstActions=[],labels=[];
 const workers=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma2'})];
 try{
  while(state.winner===null&&plies<(process.argv.includes('--smoke')?18:120)){
   const response=await workers[state.turn].search({...state,historyStates:history.slice(-48)});
   const next=chooseVaried(state,response,rng);
   if(!legal(state,next.action))throw Error('illegal varied action');
   if(next.eligible)opportunities++;
   if(next.diverted)diverted++;
   if(plies<18)firstActions.push({side:state.turn,action:next.action,diverted:next.diverted});
   labels.push(JSON.stringify(next.action));
   history.push(clone(state));state=apply(state,next.action);plies++;
  }
  const entry={id,choice,seed,forcedRootAction:action,rootSide:f.s.turn,rootWon:state.winner===f.s.turn,
    rootLoss:state.winner===1-f.s.turn,cutoff:state.winner===null,plies,
    diverted,opportunities,sequenceHash:createHash('sha256').update(labels.join(';')).digest('hex'),
    firstActions,finalDistances:[distance(state,0),distance(state,1)]};
  console.log('sample',i+1,'/',trials.length,'root',id,'c',choice,'seed',seed,'won',entry.rootWon,'plies',plies,'varied',diverted,'opp',opportunities);
  return entry;
 }finally{await Promise.all(workers.map(w=>w.close()))}
}
const START=Number(process.argv.includes('--smoke')?0:meta.results.length);
const END=process.argv.includes('--smoke')?Math.min(4,trials.length):trials.length;
for(let i=START;i<END;i+=4){
 const batch=Array.from({length:Math.min(4,END-i)},(_,j)=>i+j);
 const results=await Promise.all(batch.map(play));
 if(process.argv.includes('--smoke')){console.log('SMOKE',JSON.stringify(results.map(x=>({id:x.id,seed:x.seed,hash:x.sequenceHash,diverted:x.diverted}))))}
 else{meta.results.push(...results);writeFileSync(out,JSON.stringify(meta,null,2))}
}
console.log('SAVED',meta.results.length,'/',trials.length);
