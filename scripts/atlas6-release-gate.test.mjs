import test from 'node:test';
import assert from 'node:assert/strict';
import {assessAtlas6} from '../evaluation/atlas6-release-gate.mjs';
test('Atlas 6 cannot be promoted on a tiny or unbalanced test',()=>{
 const report={opponent:'atlas53',ms:500,cores:4,maxPlies:200,finished:2,
  gamesRequested:2,wins:2,losses:0,draws:0,moves:60,overruns:0,
  results:[{fixture:'same',atlasSide:0,verdict:'win',plies:30,reason:'goal'},
   {fixture:'same',atlasSide:0,verdict:'win',plies:30,reason:'goal'}]};
 const gate=assessAtlas6(report);
 assert.equal(gate.eligible,false);
 assert.equal(gate.checks.enoughGames,false);
 assert.equal(gate.checks.balancedSides,false);
});
test('Atlas 6 release gate demands build identity and representative coverage',()=>{
 const report={opponent:'atlas53',ms:500,cores:4,maxPlies:200,finished:200,
  gamesRequested:200,wins:150,losses:50,draws:0,moves:9000,overruns:1,
  engineBuild:'a'.repeat(64),opponentBuild:'b'.repeat(64),
  results:Array.from({length:200},(_,i)=>({fixture:'opening-'+Math.floor(i/2),
    atlasSide:i%2,verdict:i<150?'win':'loss',plies:40,reason:'goal'}))};
 assert.equal(assessAtlas6(report).eligible,true);
 assert.equal(assessAtlas6({...report,overruns:200}).eligible,false);
 assert.equal(assessAtlas6({...report,engineBuild:null}).eligible,false);
});
