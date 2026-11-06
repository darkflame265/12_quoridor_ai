import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,distance,validWall} from '../../src/game/engine.js';
test('standard Sigma tournament opening is a 9x9 centered wall-free start',()=>{
 const s=initial();
 assert.deepEqual(s.p,[{x:4,y:8},{x:4,y:0}]);
 assert.equal(s.turn,0);
 assert.deepEqual(s.walls,[]);
 assert.deepEqual(s.left,[10,10]);
 assert.equal(s.winner,null);
 assert.equal(distance(s,0),8);
 assert.equal(distance(s,1),8);
 assert.ok(validWall(s,{type:'wall',x:4,y:4,o:'h'}));
});
