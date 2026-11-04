import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,clone,apply,legal,distance,notation} from '../src/engine.js';
import {SigmaProcess} from './sigma4-isolated-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
const gameFile='evaluation/sigma4-natural-weighted-games.json';
const minedFile='evaluation/sigma4-weighted-mined.json';
const OUT='evaluation/sigma4-expanded-branch-validation.json';
const archive=JSON.parse(readFileSync(gameFile,'utf8'));
const mine=JSON.parse(readFileSync(minedFile,'utf8'));
const choices=[];
for(const row of mine.train){
 if(choices.length>=3)break;
 if(!row.gameWonBySide&&row.alternatives.length>0&&(!choices.some(x=>x.sourceSeed===row.sourceSeed)||choices.length>=2)&&row.match==='sigma2')choices.push(row);
}
if(choices.length<2)throw Error('Need distinct training source seeds');
const seeds=[78311,78317];
const tasks=choices.flatMap(root=>seeds.flatMap(seed=>[0,1].map(choice=>({id:root.id,seed,choice}))));
const version='sigma4-strong-opponent-reply-expanded-v2';
const settings={seeds,followupMethod:'weighted-our-side-vs-native-opponent',researchRate:.55,sims:200,reuse:false};
let report={version,settings,source:minedFile,planned:tasks.length,results:[]};
if(existsSync(OUT)){const old=JSON.parse(readFileSync(OUT,'utf8'));if(old.version!==version||old.planned!==tasks.length)throw Error('resume mismatch');report=old;}
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function history(root){
 const g=archive.games.find(g=>g.seed===root.sourceSeed&&g.sequenceHash===root.gameHash&&
 g.match===root.match && g.trace[root.ply]?.side===root.side);
 if(!g)throw Error('missing source trace '+root.id);
 return g.trace.filter(t=>t.ply<root.ply).map(t=>clone(t.state));
}
async function play(task){
 const row=choices.find(x=>x.id===task.id);
 let s=clone(row.rootState),h=history(row),rngState=task.seed>>>0;
 const rnd=()=>{rngState^=rngState<<13;rngState^=rngState>>>17;rngState^=rngState<<5;return (rngState>>>0)/4294967296;};
 const action=task.choice===0?row.originalAction:row.alternatives[0].action;
 if(!legal(s,action))throw Error('illegal forced action');
 h.push(clone(s));s=apply(s,action);
 Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:String(task.seed)});
 const workerVariants=row.match==='selfplay'?['sigma3','sigma3']:row.side===0?['sigma3','sigma2']:['sigma2','sigma3'];
 const ps=workerVariants.map(variant=>new SigmaProcess({variant}));
 const a=[action];let explorationChanges=0;
 try{
  for(let ply=row.ply+1;ply<200&&s.winner===null;ply++){
   const search=await ps[s.turn].search({...s,historyStates:h.slice(-48)});
   const sampled=s.turn===row.side?chooseWeightedResearchCandidate(s,search,rnd,{rate:settings.researchRate}):{action:search.pv?.[0],changed:false};
   const next=sampled.action;if(!legal(s,next))throw Error('illegal subsequent move');
   if(sampled.changed)explorationChanges++;
   h.push(clone(s));s=apply(s,next);a.push(next);
  }
  return {...task,rootSplit:row.split,side:row.side,rootKey:row.stateKey,forcedAction:action,
   forcedNotation:notation(action),rootWon:s.winner===row.side,cutoff:s.winner===null,winner:s.winner,
   continuationPlies:a.length,uniqueHash:hash(a),explorationChanges,finalPaths:[distance(s,0),distance(s,1)]};
 }finally{await Promise.all(ps.map(p=>p.close()));}
}
for(const task of tasks){
 if(report.results.some(r=>r.id===task.id&&r.seed===task.seed&&r.choice===task.choice))continue;
 const result=await play(task);
 report.results.push(result);writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
 console.log('FORCED',report.results.length+'/'+tasks.length,result.id,result.seed,result.choice,result.forcedNotation,'win',result.rootWon,'changes',result.explorationChanges);
}
console.log('SUMMARY',JSON.stringify({games:report.results.length,roots:choices.map(x=>({id:x.id,seed:x.sourceSeed,original:x.originalNotation,alternative:x.alternatives[0].notation})),unique:new Set(report.results.map(x=>x.uniqueHash)).size,
 pairedSeeds:seeds}));
