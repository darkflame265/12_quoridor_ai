import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,clone,apply,legal,notation,distance} from '../src/engine.js';
import {SigmaProcess} from '../server/sigma-process.mjs';
const INPUT='evaluation/sigma4-research-mined.json';
const OUT='evaluation/sigma4-counterfactual-trials.json';
const mined=JSON.parse(readFileSync(INPUT,'utf8'));
const archive=JSON.parse(readFileSync('evaluation/sigma4-research-games.json','utf8'));
function reconstruction(row){const g=archive.games.find(g=>g.seed===row.seed&&g.sigma3Side===row.side&&g.sequenceHash===row.gameSequenceHash);if(!g)throw Error('missing source game');let state=initial(),history=[];for(const a of g.opening){history.push(clone(state));state=apply(state,a);}for(const step of g.trace){if(step.ply>=row.ply)break;history.push(clone(step.state));}return history;}
const eligible=mined.candidateBranches.filter(x=>x.split==='train'&&x.won===0);
const selected=[];
for(const x of eligible){
 if(selected.length>=2)break;
 if(!selected.some(y=>y.seed===x.seed))selected.push(x);
}
const tasks=selected.flatMap(row=>[0,1].map(choice=>({id:row.id,choice})));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let report={version:'sigma4-counterfactual-first-divergences-v1',source:INPUT,selectionRule:'2 unique training-only lost roots, each baseline vs first comparable alternative',maxTotalPlies:200,totalTrials:tasks.length,trials:[]};
if(existsSync(OUT)){let old=JSON.parse(readFileSync(OUT,'utf8'));if(old.version!==report.version||old.totalTrials!==report.totalTrials)throw Error('resume settings mismatch');report=old;}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'0',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261104'});
async function run(task){
 const branch=selected.find(x=>x.id===task.id),side=branch.side;
 let s=clone(branch.rootState),history=reconstruction(branch);
 const rootChoice=branch.forcedActions[task.choice];
 if(!legal(s,rootChoice))throw Error('root choice illegal');
 history.push(clone(s));
 s=apply(s,rootChoice);
 const sequence=[rootChoice],workers=[new SigmaProcess({variant:side===0?'sigma3':'sigma2'}),new SigmaProcess({variant:side===1?'sigma3':'sigma2'})];
 try{
  for(let ply=branch.ply+1;ply<200&&s.winner===null;ply++){
   const result=await workers[s.turn].search({...s,historyStates:history.slice(-48)});
   const a=result.pv?.[0];if(!a||!legal(s,a))throw Error('illegal continuation');
   history.push(clone(s));sequence.push(a);s=apply(s,a);
  }
  return {id:branch.id,split:branch.split,openingHash:branch.openingHash,rootKey:branch.rootKey,side,choice:task.choice,
    forcedRootAction:rootChoice,notation:notation(rootChoice),winner:s.winner,rootWon:s.winner===side,
    cutoff:s.winner===null,continuationPlies:sequence.length,sequenceHash:sha(sequence),
    finalDistances:[distance(s,0),distance(s,1)]};
 }finally{await Promise.all(workers.map(w=>w.close()));}
}
for(let i=report.trials.length;i<tasks.length;i++){
 const row=await run(tasks[i]);report.trials.push(row);writeFileSync(OUT,JSON.stringify(report,null,2));
 console.log('BRANCH',i+1,'/',tasks.length,row.id,row.choice,row.notation,'win',row.rootWon,'plies',row.continuationPlies);
}
console.log('SUMMARY',JSON.stringify(report.trials.map(x=>({id:x.id,choice:x.choice,win:x.rootWon}))));
