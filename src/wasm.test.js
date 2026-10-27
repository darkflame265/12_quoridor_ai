import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadWasm} from './wasm-node.js';
import {initial,apply,legal,moves,validWall} from './engine.js';
import {encode,decode,Position,SearchEngine} from './search.js';
import {tactics,checkTactic,mazeOpenings} from '../evaluation/suite.js';
test('checked-in WASM matches its source and artifact checksums',async()=>{const info=JSON.parse(await readFile('public/atlas-wasm.json'));for(const [file,expected]of Object.entries({...info.sources,'public/atlas.wasm':info.artifact}))assert.equal(createHash('sha256').update(await readFile(file)).digest('hex'),expected,file);});
test('WASM rules match independent JS rules through random play and dense mazes',async()=>{
 const wasm=await loadWasm();let seed=761;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 const starts=[initial(),...mazeOpenings('development',6).map(o=>o.state)];for(const start of starts){let s=start;for(let ply=0;ply<30&&s.winner===null;ply++){const r=wasm.inspect(s),expected=moves(s).map(encode);if(s.left[s.turn])for(let a=81;a<209;a++)if(validWall(s,decode(a)))expected.push(a);assert.deepEqual(r.actions.sort((a,b)=>a-b),expected.sort((a,b)=>a-b));const a=decode(r.actions[rand()%r.actions.length]);assert(legal(s,a));s=apply(s,a);}}
});
test('WASM solves tactical fixtures and returns a legal principal variation',async()=>{const wasm=await loadWasm();for(const f of tactics()){const r=wasm.search(f.state,{ms:300,maxDepth:3});assert(checkTactic(f,r.pv[0]),f.id);let s=f.state;for(const a of r.pv){assert(legal(s,a));s=apply(s,a);}}});
test('WASM and JS static strategic evaluation agree on maze fixtures',async()=>{const wasm=await loadWasm(),search=new SearchEngine();for(const o of mazeOpenings('development',10)){const p=new Position(o.state),info=wasm.inspect(o.state);assert.deepEqual(info.distances,[p.distances(0),p.distances(1)]);assert.equal(info.score,search.evaluate(p),o.id);}});
test('partitioned root actions are legal and cancellation returns promptly',async()=>{const wasm=await loadWasm(),s=initial();for(let offset=0;offset<3;offset++){const start=performance.now(),r=wasm.search(s,{ms:10,offset,stride:3});assert(performance.now()-start<500);if(r.pv.length)assert(legal(s,r.pv[0]));}assert(legal(s,wasm.search(s,{ms:100}).pv[0]));});
