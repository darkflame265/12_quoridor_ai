import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const fixtureFile='evaluation/sigma4-strong-selfplay-midgames-20261106.json';
const fixture=JSON.parse(readFileSync(fixtureFile,'utf8'));
assert.equal(fixture.summary.attempts,16,'finish selfplay before match');
assert(fixture.openings.length>=10,'need 10 unique strong selfplay midgames');
const openings=fixture.openings.slice(0,10);
const hashes=arr=>Object.fromEntries(arr.map(p=>[p,createHash('sha256').update(readFileSync(p)).digest('hex')]));
const files=['scripts/sigma4-budget-process.mjs','scripts/sigma4-bitset-wall-worker.py','scripts/sigma4-value-residual-worker.py',
 'scripts/sigma-inference-worker.py','scripts/sigma2-baseline-worker.py','scripts/sigma4-safe-original-v3.mjs',
 'vendor/sigma-quoridor/models/best.onnx','evaluation/sigma4-value-residual-research-20261106.onnx'];
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const rootChoice=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8')).settings.rootChoice;
const config={version:'sigma4-strong-selfplay-onnx-tournament-v1',
 fixtureSha256:createHash('sha256').update(readFileSync(fixtureFile)).digest('hex'),
 fixtureIds:openings.map(x=>({id:x.id,positionId:x.positionId,seed:x.seed,split:x.split,wallCount:x.wallCount,ply:x.ply})),
 modes:['head-to-head','external'],variant:['original','corrected'],
 referenceOpponents:['sigma2','sigma3'],sides:[0,1],
 iterations:200,maxPlies:200,rootChoice,seed:20261106,
 sourceHashes:hashes(files),
 explanatoryNote:'Head-to-head compares original and corrected against each other, role swapped. External mode uses same opponent for paired original/corrected at same source, seat and policy seed'};
const jobs=openings.flatMap(p=>{
 const ref=p.attempt%2===0?'sigma2':'sigma3';
 return [
  ...[0,1].map(side=>({id:p.id,mode:'head-to-head',side,opponent:'other'})),
  ...[0,1].flatMap(side=>['original','corrected'].map(variant=>({id:p.id,mode:'external',side,opponent:ref,variant})))
 ];
});
const out='evaluation/sigma4-strong-selfplay-onnx-tournament-20261106.json';
let results={config,games:[]};
if(existsSync(out)){const previous=JSON.parse(readFileSync(out,'utf8'));assert.deepEqual(previous.config,config);results=previous;}
const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;}};
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1',SIGMA_SEED:'20261106'});
delete process.env.SIGMA3_RESEARCH_SIMS;
const agents={
 original:new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true}),
 corrected:new SigmaProcess({variant:'sigma3',simulations:200,correctedValue:true}),
 sigma2:new SigmaProcess({variant:'sigma2',simulations:200}),
 sigma3:new SigmaProcess({variant:'sigma3',simulations:200})
};
try{
 await Promise.all(Object.values(agents).map(a=>a.health()));
 for(let i=results.games.length;i<jobs.length;i++){
  const job=jobs[i],p=openings.find(x=>x.id===job.id);
  let s=initial(),hist=[],actions=[];
  for(const a of p.actions){assert(legal(s,a));hist.push(clone(s));actions.push(a);s=apply(s,a);}
  assert.deepEqual(s,p.board);
  const refSeed=config.seed+p.seed*17+job.side*811+(job.mode==='head-to-head'?113:211);
  const rand=rng(refSeed),timings={original:[],corrected:[]};
  const correctedSeat=job.mode==='head-to-head'?job.side:(job.variant==='corrected'?job.side:null);
  const originalSeat=job.mode==='head-to-head'?1-job.side:(job.variant==='original'?job.side:null);
  let firstOriginal=null,firstCorrected=null;
  while(s.winner===null&&actions.length<config.maxPlies){
   const variant=s.turn===correctedSeat?'corrected':s.turn===originalSeat?'original':job.opponent;
   const before=performance.now();
   const reply=await agents[variant].search({...s,ply:actions.length,historyStates:hist.slice(-48)});
   const elapsed=performance.now()-before;
   const a=(variant==='original'||variant==='corrected')?chooseWeightedTacticalV3(s,reply,rand,rootChoice).action:reply.pv[0];
   assert(a&&legal(s,a),'illegal '+job.id+' '+variant+' ply '+actions.length);
   if(variant==='original'||variant==='corrected'){
    timings[variant].push(elapsed);
    if(variant==='original'&&firstOriginal===null)firstOriginal={ply:actions.length,action:a};
    if(variant==='corrected'&&firstCorrected===null)firstCorrected={ply:actions.length,action:a};
   }
   hist.push(clone(s));actions.push(a);s=apply(s,a);
  }
  const game={...job,refSeed,correctedSeat,originalSeat,
   winner:s.winner,draw:s.winner===null,
   correctedWon:s.winner===correctedSeat&&correctedSeat!==null,
   originalWon:s.winner===originalSeat&&originalSeat!==null,
   candidateWon:job.mode==='external'?s.winner===job.side:null,
   totalPlies:actions.length,continuationPlies:actions.length-p.ply,
   timings,firstOriginal,firstCorrected,actionsHash:sha(actions),actions};
  results.games.push(game);
  writeFileSync(out,JSON.stringify(results)+'\n');
  console.log('STRONG MATCH',i+1,'/',jobs.length,p.id,p.split,job.mode,job.side,
    job.variant??'-',job.opponent,'winner',s.winner,'correctedWon',game.correctedWon,
    'plies',game.continuationPlies,'draw',game.draw);
 }
}finally{await Promise.all(Object.values(agents).map(a=>a.close()));}
results.summary={games:results.games.length,headToHead:results.games.filter(g=>g.mode==='head-to-head').length,
 external:results.games.filter(g=>g.mode==='external').length,
 correctedHeadWins:results.games.filter(g=>g.mode==='head-to-head'&&g.correctedWon).length,
 originalHeadWins:results.games.filter(g=>g.mode==='head-to-head'&&g.originalWon).length,
 drawCount:results.games.filter(g=>g.draw).length};
writeFileSync(out,JSON.stringify(results)+'\n');
console.log('STRONG TOURNAMENT SUMMARY',JSON.stringify(results.summary));
