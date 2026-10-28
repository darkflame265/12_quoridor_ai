import test from 'node:test';import assert from 'node:assert/strict';import {assessRootDevelopment,selectRootCandidate} from '../evaluation/root-guard-decision.mjs';
function report(mode){const games=[];for(const suite of ['general','maze'])for(let openingIndex=0;openingIndex<3;openingIndex++)for(const candidateSide of [0,1])games.push({suite,openingIndex,candidateSide,result:candidateSide===0?'win':'draw'});return {mode,split:'development',status:'completed',pairs:3,games,summary:{win:6,loss:0,draw:6},baseline:'speed',baselineIdentity:{build:'speed'},identity:{build:'root'},cohort:'search69-v1',ms:500,cores:4,maxPlies:180,tactics:Array.from({length:16},()=>({pass:true})),timing:{candidate:{moves:100,overruns:0}}};}
test('root selection compares two fixed modes and rejects failed references or deadlines',()=>{
 const p={identity:{build:'root'},speedIdentity:{build:'speed'},summary:{offParityChecks:24,fullParityChecks:24,rootDepth3Checks:12,safetyChecks:262,immediateDefensesExact:true}},a=report('root'),b=report('tactical');
 assert.equal(selectRootCandidate([a,b],p).selectedMode,'root');
 b.games[1].result='win';b.summary.win=7;b.summary.draw=5;assert.equal(selectRootCandidate([a,b],p).selectedMode,'tactical');
 b.timing.candidate.overruns=5;assert.equal(selectRootCandidate([a,b],p).selectedMode,'root');
 const bad=structuredClone(p);bad.summary.immediateDefensesExact=false;assert.equal(selectRootCandidate([a,b],bad).selectedMode,null);
 const wrong=structuredClone(a);wrong.mode='full';assert.equal(assessRootDevelopment(wrong,p).advanceToValidation,false);wrong.mode='root';wrong.split='validation';assert.equal(assessRootDevelopment(wrong,p).advanceToValidation,false);
});
