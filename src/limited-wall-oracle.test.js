import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createLimitedWallSolver} from '../evaluation/limited-wall-oracle.mjs';
import {solveOneEnemyWall} from '../evaluation/one-wall-oracle.mjs';
const cases=JSON.parse(fs.readFileSync(new URL('../pressure-engine/test-data/tie-game9.json',import.meta.url),'utf8'));
test('bounded wall verification agrees with the previously checked one-wall oracle',()=>{
 const state=cases[0].state,solver=createLimitedWallSolver(),one=solver.solve(state,1),reference=solveOneEnemyWall(state,1);
 for(let a=0;a<81;a++)for(let b=0;b<81;b++)if(a!==b)for(const turn of [0,1])assert.equal(one.lookup(a,b,turn),reference.lookup(a,b,turn));
 assert.throws(()=>solver.solve({...state,left:[2,1]},2));
});
