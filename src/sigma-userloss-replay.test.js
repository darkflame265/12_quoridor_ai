import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,legal,apply,distance} from './engine.js';
const report=JSON.parse(readFileSync('evaluation/sigma-userloss-main-replay.json','utf8'));
test('uploaded user-loss main segment has 41 legal actions, with no recorded terminal win',()=>{
 let s=initial();
 assert.equal(report.decisions.length,41);
 for(const row of report.decisions){assert.equal(s.turn,row.side);assert.ok(legal(s,row.action),`invalid ply ${row.ply}`);s=apply(s,row.action);}
 assert.equal(s.winner,null);
 assert.deepEqual(s.left,[3,0]);
 assert.deepEqual([distance(s,0),distance(s,1)],[4,1]);
 assert.equal(report.criticalWalls.length,5);
});
