import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,clone,apply,legal,distance,notation} from '../src/engine.js';
import {SigmaProcess} from './sigma4-isolated-process.mjs';
import {chooseTacticalSigma4} from './sigma4-tactical-choice.mjs';

const OUT='evaluation/sigma4-tactical-vs-sigma3.json';
const SEEDS=[104729,104743,104759,104761];
const tasks=SEEDS.flatMap(seed=>[0,1].map(sigma3Side=>({seed,match:'candidate-vs-sigma3',sigma3Side,split:'evaluation'})));
const version='sigma4-tactical-safe-vs-frozen-sigma3-paired-v1';
const settings={simulations:200,exploration:0,deterministic:true,reuse:false,experimentalCandidateRate:0.66,visitTemperature:1.05,qTemperature:0.11,maxQDrop:0.10,tacticalOnePlySafety:true,maxPlies:200,openingPrefix:'none',seedList:SEEDS};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
let report={version,settings,tacticalEvaluationOnlySeeds:SEEDS,planned:tasks.length,games:[]};
if(existsSync(OUT)){const old=JSON.parse(readFileSync(OUT,'utf8'));if(old.version!==version||JSON.stringify(old.settings)!==JSON.stringify(settings))throw Error('existing natural report mismatches');report=old;}
async function run(task){
 Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:String(settings.exploration),
  SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:String(task.seed)});
 const sides=['sigma3','sigma3'];
 const ps=sides.map(variant=>new SigmaProcess({variant}));
 let state=initial(),history=[],trace=[],actions=[],timeBySide=[0,0],overrides=0,tacticalInterventions=0,tacticalReasons={};let rngState=task.seed>>>0;const random=()=>{rngState^=rngState<<13;rngState^=rngState>>>17;rngState^=rngState<<5;return(rngState>>>0)/4294967296;};
 try{
  for(let ply=0;ply<settings.maxPlies&&state.winner===null;ply++){
   const side=state.turn;
   const res=await ps[side].search({...state,historyStates:history.slice(-48)});
   let action=res.pv?.[0];
   if(!action||!legal(state,action))throw Error('illegal move '+task.seed+' '+ply);
   const research=side===task.sigma3Side?chooseTacticalSigma4({...state,historyStates:history.slice(-48)},res,random):{action,changed:false};
   action=research.action;if(research.changed)overrides++;if(side===task.sigma3Side){tacticalReasons[research.reason]=(tacticalReasons[research.reason]||0)+1;if(['forced-immediate-win','avoid-next-turn-loss'].includes(research.reason))tacticalInterventions++;}
   const next=apply(state,action);
   const children=(res.diagnostics?.rootChildren||[]).filter(c=>c.action&&c.visits>0&&Number.isFinite(c.qFromRoot)).slice(0,6);
   trace.push({ply,side,variant:sides[side],state:clone(state),action,chosenNotation:notation(action),
    rootCandidates:children,disagreement:children.length>0&&JSON.stringify(children[0].action)!==JSON.stringify(action),
    elapsedMs:res.elapsedMs,pathsBefore:[distance(state,0),distance(state,1)],pathsAfter:[distance(next,0),distance(next,1)]});
   timeBySide[side]+=res.elapsedMs??0;
   history.push(clone(state));state=next;actions.push(action);
  }
  return {...task,sideVariants:sides,winner:state.winner,cutoff:state.winner===null,
   candidateWon:state.winner===task.sigma3Side,overrides,tacticalInterventions,tacticalReasons,
   plies:actions.length,openingPrefix:[],experimentalAgentCandidateSelection:true,explorationMethod:'tactical-one-ply-safety-then-q-visit',firstSixActions:actions.slice(0,6),
   firstSixHash:hash(actions.slice(0,6)),sequenceHash:hash(actions),
   times:timeBySide,trace};
 }finally{await Promise.all(ps.map(p=>p.close()));}
}
for(let i=report.games.length;i<tasks.length;i++){
 const row=await run(tasks[i]);report.games.push(row);
 writeFileSync(OUT,JSON.stringify(report,null,2)+'\n');
 console.log('GAME',i+1,'/',tasks.length,row.match,'seed',row.seed,'side',row.sigma3Side,'winner',row.winner,'plies',row.plies,'unique',new Set(report.games.map(x=>x.sequenceHash)).size);
}
console.log('SUMMARY',JSON.stringify({games:report.games.length,unique:new Set(report.games.map(x=>x.sequenceHash)).size,naturalFirstSix:new Set(report.games.map(x=>x.firstSixHash)).size,candidateWins:report.games.filter(x=>x.candidateWon).length}));
