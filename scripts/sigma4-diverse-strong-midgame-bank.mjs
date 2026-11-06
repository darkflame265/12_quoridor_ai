import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,moves,distance} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const file='evaluation/sigma4-diverse-strong-midgame-bank-20261106.json';
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8')).settings.rootChoice;
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const source=['scripts/sigma4-bitset-wall-worker.py','scripts/sigma-inference-worker.py','scripts/sigma4-safe-original-v3.mjs','scripts/sigma4-budget-process.mjs','vendor/sigma-quoridor/models/best.onnx'];
const settings={version:'sigma4-diverse-strong-midgame-bank-v1',
 attempts:32,targets:[20,24,28,32],sourcePolicies:['weighted-base','native-sigma3','constrained-mcts-alternative'],
 seed:20261106,simulations:200,balancedAbsPathGapMax:2,minimumPlacedWalls:7,maximumPlacedWalls:17,
 note:'All branches use actual MCTS evaluations from a legal starting position; alternative picks require visits >=5 and root Q >= best Q - 0.16; source trajectories, not independent ground-truth labels',
 sourceHashes:Object.fromEntries(source.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]))};
let report={settings,attempts:[],positions:[]};
if(existsSync(file)){const old=JSON.parse(readFileSync(file,'utf8'));assert.deepEqual(old.settings,settings);report=old;}
const random=seed=>{let x=seed>>>0;return()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296;}};
const canonical=s=>hash({p:s.p,walls:s.walls.map(w=>({x:w.x,y:w.y,o:w.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
const used=new Set();
for(const f of ['evaluation/sigma4-value-development-positions-20261105.jsonl','evaluation/sigma4-value-holdout-positions-20261105.jsonl','evaluation/sigma4-unseen-wall-positions-20261105.jsonl'])
 for(const ln of readFileSync(f,'utf8').trim().split('\n')){const v=JSON.parse(ln);used.add(canonical(v.state));}
for(const v of JSON.parse(readFileSync('evaluation/sigma4-strong-selfplay-midgames-20261106.json')).openings)used.add(canonical(v.board));
for(const v of report.positions)used.add(v.positionId);
const noGoalInOne=(s,action)=>{
 const ns=apply(s,action);
 return ns.winner!==null||!moves(ns).some(a=>apply(ns,a).winner===ns.turn);
};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const engines={
 weighted:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 native:new SigmaProcess({variant:'sigma3',simulations:200})
};
try{
 await Promise.all(Object.values(engines).map(x=>x.health()));
 for(let i=report.attempts.length;i<settings.attempts;i++){
  const seed=11290651+i*3971,rng=random(seed);
  const style=settings.sourcePolicies[i%3];
  const preferredSide=i%2;
  const target=32;
  let state=initial(),actions=[],history=[],snapshots=[],alternatives=0;
  while(state.winner===null&&actions.length<target){
   const side=state.turn;
   const search=await engines[side===preferredSide?'weighted':'native'].search({...state,ply:actions.length,historyStates:history.slice(-48)});
   let chosen=style==='native-sigma3'?search.pv[0]:chooseWeightedTacticalV3(state,search,rng,rootChoice).action;
   if(style==='constrained-mcts-alternative'&&actions.length<14&&rng()<.55){
    const children=search.diagnostics?.rootChildren??[];
    const leading=children.find(x=>Number.isFinite(x.qFromRoot)&&x.visits>=5);
    if(leading){
     const alternativesAllowed=children.filter(c=>
      c.action&&legal(state,c.action)&&c.visits>=5&&
      Number.isFinite(c.qFromRoot)&&c.qFromRoot>=leading.qFromRoot-.16&&
      JSON.stringify(c.action)!==JSON.stringify(chosen)&&noGoalInOne(state,c.action));
     if(alternativesAllowed.length){
      chosen=alternativesAllowed[Math.floor(rng()*alternativesAllowed.length)].action;alternatives++;
     }
    }
   }
   assert(chosen&&legal(state,chosen));
   history.push(clone(state));actions.push(chosen);state=apply(state,chosen);
   const ply=actions.length;
   if(settings.targets.includes(ply)&&state.winner===null){
    const gap=distance(state,state.turn)-distance(state,1-state.turn);
    snapshots.push({ply,gap,wallCount:state.walls.length,positionId:canonical(state),
      state:clone(state),actions:[...actions]});
   }
  }
  const valid=snapshots.filter(v=>Math.abs(v.gap)<=settings.balancedAbsPathGapMax&&
    v.wallCount>=settings.minimumPlacedWalls&&v.wallCount<=settings.maximumPlacedWalls&&
    !used.has(v.positionId));
  valid.sort((a,b)=>Math.abs(a.gap)-Math.abs(b.gap)||Math.abs(a.wallCount-12)-Math.abs(b.wallCount-12)||b.ply-a.ply);
  const best=valid[0];
  const accepted=Boolean(best);
  const summary={attempt:i,seed,style,preferredSide,totalPlies:actions.length,
    terminal:state.winner!==null,alternativeChoices:alternatives,availableSnapshots:snapshots.length,
    eligibleSnapshots:valid.length,accepted,selectedPly:best?.ply??null,
    selectedGap:best?.gap??null,selectedWalls:best?.wallCount??null};
  report.attempts.push(summary);
  if(accepted){
   used.add(best.positionId);
   report.positions.push({id:'diverse-strong-'+String(i+1).padStart(3,'0'),attempt:i,seed,sourceStyle:style,
    preferredSide,split:i%4===0?'holdout':'development',
    positionId:best.positionId,ply:best.ply,wallCount:best.wallCount,
    pathGap:best.gap,alternatives,board:best.state,actions:best.actions,
    labelStatus:'unlabeled actual MCTS-generated state, not a win/loss training example'});
  }
  writeFileSync(file,JSON.stringify(report)+'\n');
  console.log('DIVERSE GENERATION',i+1,'/',settings.attempts,style,'alt',alternatives,
    'eligible',valid.length,'accepted',accepted,'groups',report.positions.length,
    best?'wall '+best.wallCount+' gap '+best.gap:'');
 }
}finally{await Promise.all(Object.values(engines).map(e=>e.close()));}
report.summary={attempts:report.attempts.length,uniquePositions:report.positions.length,
 development:report.positions.filter(x=>x.split==='development').length,
 holdout:report.positions.filter(x=>x.split==='holdout').length,
 balanced:report.positions.every(x=>Math.abs(x.pathGap)<=settings.balancedAbsPathGapMax),
 sourceStyles:Object.fromEntries(settings.sourcePolicies.map(p=>[p,report.positions.filter(x=>x.sourceStyle===p).length]))};
writeFileSync(file,JSON.stringify(report)+'\n');
console.log('DIVERSE SELFPLAY SUMMARY',JSON.stringify(report.summary));
