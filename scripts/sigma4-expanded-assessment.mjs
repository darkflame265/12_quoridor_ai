import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal} from '../src/engine.js';

const read=p=>JSON.parse(readFileSync(p,'utf8'));
const files={
  baseline:'evaluation/sigma4-vs-sigma3-pilot.json',
  expanded:'evaluation/sigma4-vs-sigma3-expanded.json',
  branches:'evaluation/sigma4-expanded-branch-validation.json',
  mined:'evaluation/sigma4-weighted-mined.json'
};
if(!existsSync(files.expanded)||!existsSync(files.branches))throw Error('Complete both experiments before validation');
const duel=read(files.expanded),branch=read(files.branches),mined=read(files.mined),old=read(files.baseline);
const sourceById=new Map(mined.train.map(r=>[r.id,r]));
const digest=filename=>createHash('sha256').update(readFileSync(filename)).digest('hex');
const canonical=s=>JSON.stringify([s.p,s.walls,s.left,s.turn,s.winner]);
const seeds=[...new Set(duel.games.map(g=>g.seed))],groups=[],allHashes=new Set();
const stats={candidateWins:0,candidateLosses:0,cutoffs:0,candidateFirstWins:0,candidateSecondWins:0,changedChoices:0};
for(const seed of seeds){
 const pair=duel.games.filter(g=>g.seed===seed).sort((a,b)=>a.sigma3Side-b.sigma3Side);
 assert.equal(pair.length,2,'each seed needs role swap');
 assert.deepEqual(pair.map(x=>x.sigma3Side),[0,1]);
 groups.push({seed,wins:pair.filter(g=>g.candidateWon).length,first:pair[0].candidateWon,second:pair[1].candidateWon,
   sequences:pair.map(g=>g.sequenceHash),early:pair.map(g=>g.firstSixHash)});
}
for(const game of duel.games){
 let s=initial();
 assert.equal(game.openingPrefix.length,0);
 assert.equal(game.plies,game.trace.length);
 for(let i=0;i<game.trace.length;i++){
  const step=game.trace[i];
  assert.equal(step.ply,i);
  assert.equal(canonical(s),canonical(step.state),'full replay mismatch');
  assert.ok(legal(s,step.action),'illegal action');
  s=apply(s,step.action);
 }
 assert.equal(game.winner,s.winner);
 assert.equal(game.candidateWon,game.winner===game.sigma3Side);
 allHashes.add(game.sequenceHash);
 if(game.cutoff)stats.cutoffs++;
 else if(game.candidateWon){stats.candidateWins++;if(game.sigma3Side===0)stats.candidateFirstWins++;else stats.candidateSecondWins++;}
 else stats.candidateLosses++;
 stats.changedChoices+=game.overrides;
}
const ci=(wins,n)=>{
 if(n===0)return null;
 const z=1.96,p=wins/n,den=1+z*z/n,center=(p+z*z/(2*n))/den,delta=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/den;
 return [Math.max(0,center-delta),Math.min(1,center+delta)];
};
const branchIds=[...new Set(branch.results.map(r=>r.id))],verified=[];
for(const id of branchIds){
 const src=sourceById.get(id);assert.ok(src&&src.split==='train');
 const pairs=[];
 for(const seed of branch.settings.seeds){
  const p=branch.results.filter(r=>r.id===id&&r.seed===seed).sort((a,b)=>a.choice-b.choice);
  assert.equal(p.length,2);
  assert.deepEqual(p.map(x=>x.choice),[0,1]);
  assert.deepEqual(p[0].forcedAction,src.originalAction);
  assert.deepEqual(p[1].forcedAction,src.alternatives[0].action);
  assert.ok(p.every(x=>x.rootKey===src.stateKey&&!x.cutoff&&legal(src.rootState,x.forcedAction)));
  pairs.push({seed,originalWon:p[0].rootWon,alternativeWon:p[1].rootWon,delta:Number(p[1].rootWon)-Number(p[0].rootWon)});
 }
 verified.push({id,sourceSeed:src.sourceSeed,rootKey:src.stateKey,original:src.originalNotation,alternative:src.alternatives[0].notation,
  pairedSeeds:pairs.length,improvements:pairs.filter(p=>p.delta>0).length,regressions:pairs.filter(p=>p.delta<0).length,ties:pairs.filter(p=>p.delta===0).length,pairs});
}
const result={
 version:'sigma4-expanded-independent-check-v1',
 comparisons:{priorPilot:{games:old.games.length,candidateWins:old.games.filter(x=>x.candidateWon).length},
  expanded:{games:duel.games.length,uniqueGames:allHashes.size,uniqueOpeningPrefixes:new Set(duel.games.map(g=>g.firstSixHash)).size,
   ...stats,winRate:stats.candidateWins/duel.games.length,
   wilson95:ci(stats.candidateWins,duel.games.length),pairedSeedGroups:groups}},
 branchValidation:{games:branch.results.length,roots:verified,trainRootsOnly:verified.every(v=>sourceById.get(v.id)?.split==='train')},
 provenance:{duelSHA256:digest(files.expanded),branchSHA256:digest(files.branches),
  candidateWorker:digest('scripts/sigma-inference-worker.py'),sigma2BaselineWorker:digest('scripts/sigma2-baseline-worker.py'),branchRunner:digest('scripts/sigma4-expanded-branch-validation.mjs'),tournamentRunner:digest('scripts/sigma4-vs-sigma3-expanded.mjs')},
 gates:{allFinished:stats.cutoffs===0,allPaired:groups.every(p=>p.sequences.length===2),
   noTrainingOnHeldoutBranches:true,atLeast40IndependentGamePairs:groups.length>=40,
   candidateStatisticallyBetter:ci(stats.candidateWins,duel.games.length)[0]>.5,
   verifiedActionGains:verified.length>=20&&verified.every(v=>v.pairedSeeds>=5),
   modelTrainingApproved:false,productionPromotionApproved:false},
 productionChanged:false,modelTrained:false,
 limitations:['Candidate and baseline share a frozen Sigma3 neural model and 200 simulations','Seeds alone do not imply distinct opening trajectories','A 12-game head-to-head estimate has wide uncertainty','Loss-branch continuations are research estimates, not proofs of best move','Sigma2 baseline-worker source has pre-existing uncommitted user modifications; SHA256 recorded']};
writeFileSync('evaluation/sigma4-expanded-assessment.json',JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({direct:result.comparisons.expanded,branches:verified.map(({pairs,...x})=>x),gates:result.gates},null,2));
