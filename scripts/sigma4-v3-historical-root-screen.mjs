import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal,moves} from '../src/engine.js';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {chooseWeightedTacticalV3} from './sigma4-safe-original-v3.mjs';

const previous=JSON.parse(readFileSync('evaluation/sigma4-original-weighted-vs-sigma23-20261105.json','utf8'));
const origOpts=previous.settings.rootChoice;
const cautious={...origOpts,rate:.55,temperature:.9,qTemperature:.12,maxQDrop:.10};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const productionRng=state=>{
 const text=JSON.stringify([state.p,state.walls,state.left,state.turn,state.historyStates?.length??0]);
 let n=2166136261;
 for(let i=0;i<text.length;i++)n=Math.imul(n^text.charCodeAt(i),16777619)>>>0;
 return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return(n>>>0)/4294967296;};
};
const imminent=s=>moves(s).some(a=>apply(s,a).winner===s.turn);
const unsafe=(s,a)=>{const next=apply(s,a);return next.winner===null&&imminent(next);};
const rows=[],contexts=[];
for(const game of previous.games){
 const fixture=previous.fixtures.find(x=>x.id===game.fixture);assert(fixture);
 let state=initial(),allPrevious=[];
 for(const a of fixture.actions){assert(legal(state,a));allPrevious.push(clone(state));state=apply(state,a);}
 for(const t of game.trace){
  assert.equal(t.ply,allPrevious.length);
  if(t.engine==='candidate'){
   assert(t.baseAction&&legal(state,t.baseAction));
   const cur={...state,historyStates:allPrevious.slice(-48)};
   const search={pv:[t.baseAction],diagnostics:{rootChildren:t.rootChildren}};
   const base=chooseWeightedResearchCandidate(state,search,productionRng(cur),origOpts);
   const guarded=chooseWeightedTacticalV3(state,search,productionRng(cur),origOpts);
   const weights=chooseWeightedResearchCandidate(state,search,productionRng(cur),cautious);
   assert(legal(state,base.action)&&legal(state,guarded.action)&&legal(state,weights.action));
   const data={game:game.index,fixture:fixture.id,opponent:game.opponent,
    historicalCandidateWon:game.candidateWon,ply:t.ply,
    baselineAction:base.action,safetyAction:guarded.action,cautiousAction:weights.action,
    safetyChanged:!same(base.action,guarded.action),
    cautiousChanged:!same(base.action,weights.action),
    originalImmediateLoss:unsafe(state,base.action),
    safetyImmediateLoss:unsafe(state,guarded.action),
    safetyReason:guarded.reason??guarded.tacticalSafety??'native',
    baselineReason:base.reason,
    originalMctsAction:t.baseAction};
   rows.push(data);
  }
  assert(legal(state,t.action));allPrevious.push(clone(state));state=apply(state,t.action);
 }
 assert.equal(state.winner,game.winner);
}
const summary=group=>({
 decisions:group.length,
 safetyChanges:group.filter(x=>x.safetyChanged).length,
 cautiousChanges:group.filter(x=>x.cautiousChanged).length,
 immediateLossExposures:group.filter(x=>x.originalImmediateLoss).length,
 safetyPreventedImmediateLoss:group.filter(x=>x.originalImmediateLoss&&!x.safetyImmediateLoss).length,
 guardedStillExposesImmediateLoss:group.filter(x=>x.safetyImmediateLoss).length});
const report={version:'sigma4-v3-historical-root-regression-screen-v1',
 source:'evaluation/sigma4-original-weighted-vs-sigma23-20261105.json',
 rootOptions:origOpts,conservativeOptions:cautious,
 all:summary(rows),losingGames:summary(rows.filter(x=>!x.historicalCandidateWon)),
 winningGames:summary(rows.filter(x=>x.historicalCandidateWon)),
 byOpponent:Object.fromEntries(['sigma2','sigma3'].map(op=>[op,summary(rows.filter(x=>x.opponent===op))])),
 changingExamples:rows.filter(x=>x.safetyChanged||x.cautiousChanged),
 criticalExamples:rows.filter(x=>x.originalImmediateLoss),
 promotionEvidence:false,
 caveat:'Historical counterfactual action screen at fixed recorded states; no subsequent rollout for alternate actions. Cannot infer alternative-game win/loss.'};
writeFileSync('evaluation/sigma4-v3-historical-root-regression-20261106.json',JSON.stringify(report,null,2)+'\n');
console.log('PASS HISTORICAL ROOT SCREEN',JSON.stringify({all:report.all,losses:report.losingGames,
 byOpponent:report.byOpponent,critical:report.criticalExamples.slice(0,5)},null,2));
