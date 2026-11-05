import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal,moves} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedMidgameV4} from './sigma4-midgame-risk-v4.mjs';
const d=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8'));
const options=d.settings.rootChoice;
const rngState=seed=>{let value=seed>>>0;return {get state(){return value;},next(){value^=value<<13;value^=value>>>17;value^=value<<5;return (value>>>0)/4294967296;}}};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const summary=[],divergences=[];
for(const g of d.games){
 const fixture=d.fixtures.find(f=>f.id===g.fixture);
 let state=initial(),originalMatches=0,totalCandidate=0;
 for(const a of fixture.actions)state=apply(state,a);
 const seed=g.seed>>>0,prng=rngState(seed);
 for(const t of g.trace){
  if(t.engine==='candidate'){
   totalCandidate++;
   const search={pv:[t.baseAction],diagnostics:{rootChildren:t.rootChildren}};
   const copy=rngState(prng.state);
   const old=chooseWeightedResearchCandidate(state,search,()=>prng.next(),options);
   if(!same(old.action,t.action)){
    throw Error('Historical candidate not reproducible, game '+g.index+' ply '+t.ply+
      ' expected '+JSON.stringify(t.action)+' got '+JSON.stringify(old.action));
   }
   originalMatches++;
   const guarded=chooseWeightedMidgameV4(state,search,()=>copy.next(),options);
   if(!same(old.action,guarded.action)){
    divergences.push({game:g.index,opponent:g.opponent,won:g.candidateWon,fixture:g.fixture,ply:t.ply,
      original:old.action,guarded:guarded.action,reason:guarded.reason,
      originalImmediatelyLoses:(()=>{const n=apply(state,old.action);return n.winner===null&&moves(n).some(a=>apply(n,a).winner===n.turn)})()});
   }
  }
  state=apply(state,t.action);
 }
 summary.push({game:g.index,opponent:g.opponent,won:g.candidateWon,candidateChoices:totalCandidate,oldReplayed:originalMatches});
}
const out={version:'sigma4-v4-midgame-historical-decision-replay-v1',
 totalCandidateChoices:summary.reduce((a,g)=>a+g.candidateChoices,0),
 fullyReproduced:true,divergenceCount:divergences.length,divergences,summary,
 limitations:['This audit examines a fixed historical trajectory: it cannot infer what would happen after a different v3 choice.',
 'Root candidate diagnostics in historical traces are truncated at six, matching the original policy six-candidate cap.',
 'It proves local legal tactical changes, not win-rate improvement.']};
writeFileSync('evaluation/sigma4-v4-midgame-historical-replay-audit.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify({total:out.totalCandidateChoices,reproduced:out.fullyReproduced,divergences},null,2));
