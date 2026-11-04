import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,clone,apply,legal,distance,notation} from '../src/engine.js';
import {SigmaProcess} from './sigma4-isolated-process.mjs';
import {chooseResearchCandidate} from './sigma4-explore-root.mjs';

const OUT='evaluation/sigma4-natural-exploratory-games.json';
const SEEDS=[63853,75439];
const tasks=SEEDS.flatMap((seed,i)=>[
 {seed,match:'sigma2',sigma3Side:0,split:i===2?'holdout':'train'},
 {seed,match:'sigma2',sigma3Side:1,split:i===2?'holdout':'train'},
 {seed,match:'selfplay',sigma3Side:0,split:i===2?'holdout':'train'}
]);
const version='sigma4-research-guided-exploration-v1';
const settings={simulations:200,exploration:0,deterministic:true,reuse:false,experimentalCandidateRate:0.38,maxPlies:200,openingPrefix:'none',seedList:SEEDS};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let report={version,settings,trainSeeds:SEEDS.slice(0,2),holdoutSeeds:SEEDS.slice(2),planned:tasks.length,games:[]};
if(existsSync(OUT)){const old=JSON.parse(readFileSync(OUT,'utf8'));if(old.version!==version||JSON.stringify(old.settings)!==JSON.stringify(settings))throw Error('existing natural report mismatches');report=old;}
async function run(task){
 Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:String(settings.exploration),
  SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:String(task.seed)});
 const sides=task.match==='selfplay'?['sigma3','sigma3']:
   [task.sigma3Side===0?'sigma3':'sigma2',task.sigma3Side===1?'sigma3':'sigma2'];
 const ps=sides.map(variant=>new SigmaProcess({variant}));
 let state=initial(),history=[],trace=[],actions=[],timeBySide=[0,0],overrides=0;let rngState=task.seed>>>0;const random=()=>{rngState^=rngState<<13;rngState^=rngState>>>17;rngState^=rngState<<5;return(rngState>>>0)/4294967296;};
 try{
  for(let ply=0;ply<settings.maxPlies&&state.winner===null;ply++){
   const side=state.turn;
   const res=await ps[side].search({...state,historyStates:history.slice(-48)});
   let action=res.pv?.[0];
   if(!action||!legal(state,action))throw Error('illegal move '+task.seed+' '+ply);
   const research=chooseResearchCandidate(state,res,random,{rate:settings.experimentalCandidateRate});
   action=research.action;if(research.changed)overrides++;
   const next=apply(state,action);
   const children=(res.diagnostics?.rootChildren||[]).filter(c=>c.action&&c.visits>0&&Number.isFinite(c.qFromRoot)).slice(0,6);
   trace.push({ply,side,variant:sides[side],state:clone(state),action,chosenNotation:notation(action),
    rootCandidates:children,disagreement:children.length>0&&JSON.stringify(children[0].action)!==JSON.stringify(action),
    elapsedMs:res.elapsedMs,pathsBefore:[distance(state,0),distance(state,1)],pathsAfter:[distance(next,0),distance(next,1)]});
   timeBySide[side]+=res.elapsedMs??0;
   history.push(clone(state));state=next;actions.push(action);
  }
  return {...task,sideVariants:sides,winner:state.winner,cutoff:state.winner===null,
   sigma3Won:task.match==='sigma2'?state.winner===task.sigma3Side:null,overrides,
   plies:actions.length,openingPrefix:[],experimentalAgentCandidateSelection:true,firstSixActions:actions.slice(0,6),
   firstSixHash:hash(actions.slice(0,6)),sequenceHash:hash(actions),
   times:timeBySide,trace};
 }finally{await Promise.all(ps.map(p=>p.close()));}
}
for(let i=report.games.length;i<tasks.length;i++){
 const row=await run(tasks[i]);report.games.push(row);
 writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
 console.log('GAME',i+1,'/',tasks.length,row.match,'seed',row.seed,'side',row.sigma3Side,'winner',row.winner,'plies',row.plies,'unique',new Set(report.games.map(x=>x.sequenceHash)).size);
}
console.log('SUMMARY',JSON.stringify({games:report.games.length,unique:new Set(report.games.map(x=>x.sequenceHash)).size,naturalFirstSix:new Set(report.games.map(x=>x.firstSixHash)).size,matchWins:report.games.filter(x=>x.match==='sigma2'&&x.sigma3Won).length}));
