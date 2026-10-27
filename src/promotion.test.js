import test from 'node:test';
import assert from 'node:assert/strict';
import {assess} from '../scripts/promote.mjs';
function reports(){const make=(split,pairs,wins,losses)=>({split,pairs,opponent:'atlas2',sourceHash:'frozen',games:Array.from({length:pairs*2},()=>({})),tactics:Array.from({length:16},()=>({pass:true})),summary:{wins,losses,draws:0,candidate:{overruns:0,moves:200}}});return [make('validation',6,7,5),make('holdout',8,10,6)];}
test('a losing holdout cannot replace the live baseline',()=>{const r=reports();r[1].summary.wins=6;r[1].summary.losses=10;assert.equal(assess(...r,'frozen').eligible,false);});
test('changing candidate after evaluation invalidates promotion',()=>{assert.equal(assess(...reports(),'different source').eligible,false);});
test('an interrupted run or missed tactic prevents promotion',()=>{let r=reports();r[1].games.pop();assert.equal(assess(...r,'frozen').eligible,false);r=reports();r[0].tactics[0].pass=false;assert.equal(assess(...r,'frozen').eligible,false);});
