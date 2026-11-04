import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,clone,apply,moves,validWall,legal,notation,distance} from '../src/engine.js';
import {SigmaProcess} from '../server/sigma-process.mjs';
const resultPath='evaluation/sigma4-research-extended-games.json';
const SEEDS=[15311,19877];
function rng(seed){let n=seed>>>0;return ()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;};}
const sig=(s)=>JSON.stringify([s.p,s.walls.map(w=>[w.x,w.y,w.o]).sort(),s.left,s.turn]);
const sha=(x)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
function prefix(seed){
 const r=rng(seed);let state=initial();const history=[],opening=[];
 for(let ply=0;ply<6;ply++){
  let candidates=moves(state);
  if(ply>=2 && ply<=4){
   const walls=[];
   for(let y=2;y<=5;y++)for(let x=2;x<=5;x++)for(const o of ['h','v']){
    const a={type:'wall',x,y,o};if(validWall(state,a))walls.push(a);
   }
   if(walls.length&&r()<.28)candidates=walls;
  }
  // Controlled exploratory prefix: diverse legal actions, never an AI move.
  const pick=candidates[Math.floor(r()*candidates.length)];
  if(!pick||!legal(state,pick))throw Error('illegal generated opening');
  history.push(clone(state));opening.push(pick);state=apply(state,pick);
 }
 return {state,history,opening,openingHash:sha(opening)};
}
const positions=SEEDS.map(seed=>({...prefix(seed),seed}));
if(new Set(positions.map(x=>x.openingHash)).size!==SEEDS.length)throw Error('duplicate opening');
const tasks=positions.flatMap(p=>[0,1].map(side=>({seed:p.seed,sigma3Side:side})));
const meta={version:'sigma4-research-extended-openings-v1',seeds:SEEDS,openingPlies:6,
 processSettings:{simulations:200,exploration:0,deterministic:true,reuse:true},
 model:'frozen best.onnx for sigma2 and sigma3',games:[]};
let report=meta;
if(existsSync(resultPath)){report=JSON.parse(readFileSync(resultPath,'utf8'));if(report.version!==meta.version||JSON.stringify(report.seeds)!==JSON.stringify(SEEDS))throw Error('resume mismatch');}
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_SEED:'20261104'});
async function run(task){
 const p=positions.find(p=>p.seed===task.seed);
 let state=clone(p.state), history=p.history.map(clone);
 const workers=[new SigmaProcess({variant:task.sigma3Side===0?'sigma3':'sigma2'}),new SigmaProcess({variant:task.sigma3Side===1?'sigma3':'sigma2'})];
 const trace=[],allActions=p.opening.slice();
 try{
  for(let ply=6;ply<200 && state.winner===null;ply++){
   const side=state.turn;
   const r=await workers[side].search({...state,historyStates:history.slice(-48)});
   const action=r.pv?.[0];
   if(!action||!legal(state,action))throw Error('illegal worker action '+task.seed+':'+ply);
   const next=apply(state,action);
   const children=(r.diagnostics?.rootChildren||[]).slice(0,6);
   const ranked=children.filter(c=>c.action&&c.visits>0&&Number.isFinite(c.qFromRoot));
   const chosen=ranked.find(c=>JSON.stringify(c.action)===JSON.stringify(action));
   trace.push({ply,side,variant:side===task.sigma3Side?'sigma3':'sigma2',
    state:clone(state),action,elapsedMs:r.elapsedMs,
    pathBefore:[distance(state,0),distance(state,1)],pathAfter:[distance(next,0),distance(next,1)],
    rootCandidates:ranked,chosenMcts:chosen??null,
    disagreement:ranked.length>0&&JSON.stringify(ranked[0].action)!==JSON.stringify(action),
    qSpread:ranked.length>1?ranked[0].qFromRoot-ranked[1].qFromRoot:null});
   allActions.push(action);
   history.push(clone(state));state=next;
  }
  return {...task,openingHash:p.openingHash,opening:p.opening,openingNotation:p.opening.map(notation),
   winner:state.winner, sigma3Won:state.winner===task.sigma3Side,cutoff:state.winner===null,
   totalPlies:allActions.length,continuationPlies:trace.length,
   sequenceHash:sha(allActions),trace};
 } finally {await Promise.all(workers.map(w=>w.close()));}
}
for(let i=report.games.length;i<tasks.length;i++){
 const row=await run(tasks[i]);report.games.push(row);
 writeFileSync(resultPath,JSON.stringify(report,null,2));
 console.log('GAME',i+1,'/',tasks.length,'seed',row.seed,'side',row.sigma3Side,'win',row.sigma3Won,'plies',row.totalPlies,'unique',new Set(report.games.map(g=>g.sequenceHash)).size);
}
console.log('SUMMARY',JSON.stringify({games:report.games.length,unique:new Set(report.games.map(g=>g.sequenceHash)).size,wins:report.games.filter(g=>g.sigma3Won).length,
sideWins:[0,1].map(side=>report.games.filter(g=>g.sigma3Side===side&&g.sigma3Won).length)}));
