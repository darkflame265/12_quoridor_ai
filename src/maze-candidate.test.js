import test from 'node:test';
import assert from 'node:assert/strict';
import {assessMaze} from '../evaluation/maze-candidate-policy.mjs';
function report(split,pairs){const r={status:'completed',split,pairs,ms:500,cores:4,maxPlies:180,identity:{test:1},games:[],tactics:Array.from({length:16},()=>({pass:true})),timing:{candidate:{moves:100,overruns:0}}};for(const suite of ['general','maze'])for(let i=0;i<pairs;i++)for(const side of [0,1])r.games.push({suite,openingIndex:i,candidateSide:side,result:'win',replayValidated:true});return r;}
test('maze candidate needs paired validation and separate holdout before eligibility',()=>{
 const v=report('validation',3),h=report('holdout',4);v.mode='cache4';h.mode='cache4';assert(assessMaze(v,h).eligible);assert(!assessMaze(v,null).eligible);
 const bad=structuredClone(h);bad.games[0]=structuredClone(bad.games[1]);assert(!assessMaze(v,bad).eligible);
 for(const change of [r=>r.mode='coverage8',r=>r.identity.test++,r=>r.timing.candidate.overruns=5,r=>r.tactics[0].pass=false,r=>r.split='validation',r=>r.games.forEach(g=>g.result='draw')]){const bad=structuredClone(h);change(bad);assert(!assessMaze(v,bad).eligible);}
});
