import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,clone,apply,legal,notation,distance} from '../src/engine.js';
import {SigmaProcess} from './sigma4-isolated-process.mjs';
const sourceReport=JSON.parse(readFileSync('evaluation/sigma4-research-games.json','utf8'));
const mined=JSON.parse(readFileSync('evaluation/sigma4-research-mined.json','utf8'));
const older=JSON.parse(readFileSync('evaluation/sigma4-counterfactual-trials.json','utf8'));
const ids=[...new Set(older.trials.map(t=>t.id))];
const selected=ids.map(id=>mined.candidateBranches.find(b=>b.id===id));
if(selected.some(x=>!x||x.split!=='train'))throw Error('invalid original training roots');
const SEEDS=[24011,24029,24047];
const tasks=selected.flatMap(branch=>SEEDS.flatMap(seed=>[0,1].map(choice=>({id:branch.id,seed,choice}))));
const OUT='evaluation/sigma4-repeated-branches-paired.json';
const version='sigma4-matched-mcts-diverse-continuations-v3';
const settings={exploration:0,sims:200,reuse:false,deterministic:true,experimentalOverrideProbability:0.3,seedList:SEEDS};
let report={version,settings,source:'evaluation/sigma4-research-mined.json',sourceVersion:mined.version,planned:tasks.length,trials:[]};
if(existsSync(OUT)){const old=JSON.parse(readFileSync(OUT,'utf8'));if(old.version!==version||old.planned!==tasks.length||JSON.stringify(old.settings)!==JSON.stringify(settings))throw Error('report mismatch');report=old;}
const key=t=>t.id+'|'+t.seed+'|'+t.choice;
const seen=new Set(report.trials.map(key));
function fullHistory(branch){
 const game=sourceReport.games.find(g=>g.seed===branch.seed&&g.sigma3Side===branch.side&&g.sequenceHash===branch.gameSequenceHash);
 if(!game)throw Error('source game missing');
 let s=initial(),history=[];
 for(const action of game.opening){history.push(clone(s));s=apply(s,action);}
 for(const step of game.trace){if(step.ply>=branch.ply)break;history.push(clone(step.state));}
 return history;
}
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
async function game(task){
 const branch=selected.find(x=>x.id===task.id);
 let s=clone(branch.rootState),history=fullHistory(branch);
 const action=branch.forcedActions[task.choice];
 if(!legal(s,action))throw Error('illegal root choice');
 history.push(clone(s));s=apply(s,action);
 let experimentalDeviations=0;let rngState=(task.seed)>>>0;const random=()=>{rngState^=rngState<<13;rngState^=rngState>>>17;rngState^=rngState<<5;return (rngState>>>0)/4294967296;};const movesPlayed=[action];
 // Fixed seat-specific independent deterministic streams, paired across candidate actions.
 Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:String(settings.exploration),
  SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:String(task.seed)});
 const ps=[new SigmaProcess({variant:branch.side===0?'sigma3':'sigma2'}),new SigmaProcess({variant:branch.side===1?'sigma3':'sigma2'})];
 try{
  for(let ply=branch.ply+1;ply<200&&s.winner===null;ply++){
   const result=await ps[s.turn].search({...s,historyStates:history.slice(-48)});
   let a=result.pv?.[0];if(!a||!legal(s,a))throw Error('illegal response at ply '+ply);
   const ranked=result.diagnostics?.rootChildren||[],leader=ranked[0];
   if(leader&&Number.isFinite(leader.qFromRoot)&&apply(s,a).winner!==s.turn&&random()<settings.experimentalOverrideProbability){
    const pool=ranked.filter(c=>c.action&&legal(s,c.action)&&c.visits>=Math.max(4,leader.visits*.08)&&Number.isFinite(c.qFromRoot)&&leader.qFromRoot-c.qFromRoot<=.18&&JSON.stringify(c.action)!==JSON.stringify(a)).slice(0,3);
    if(pool.length){a=pool[Math.floor(random()*pool.length)].action;experimentalDeviations++;}
   }
   history.push(clone(s));movesPlayed.push(a);s=apply(s,a);
  }
  return {...task,rootKey:branch.rootKey,split:branch.split,openingHash:branch.openingHash,
   forcedAction:action,forcedNotation:notation(action),side:branch.side,winner:s.winner,
   rootWon:s.winner===branch.side,cutoff:s.winner===null,continuationPlies:movesPlayed.length,experimentalDeviations,
   sequenceHash:sha(movesPlayed),remaining:[distance(s,0),distance(s,1)]};
 }finally{await Promise.all(ps.map(p=>p.close()));}
}
for(const task of tasks){
 if(seen.has(key(task)))continue;
 const result=await game(task);
 report.trials.push(result);writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
 console.log('TRIAL',report.trials.length+'/'+tasks.length,result.id,'seed',result.seed,'choice',result.choice,result.forcedNotation,'win',result.rootWon,'plies',result.continuationPlies,'unique',new Set(report.trials.map(t=>t.sequenceHash)).size);
}
console.log('DONE',JSON.stringify({trials:report.trials.length,uniqueContinuations:new Set(report.trials.map(t=>t.sequenceHash)).size}));
