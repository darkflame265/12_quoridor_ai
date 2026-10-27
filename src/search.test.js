import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,moves,validWall,legal} from './engine.js';
import {Position,SearchEngine,encode,decode} from './search.js';
test('optimized rules match independent reference across random games',()=>{
 let seed=813;const rand=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed;};
 for(let game=0;game<8;game++){let s=initial();for(let ply=0;ply<55&&s.winner===null;ply++){
   const p=new Position(s),hash=p.hash,sig=p.signature(),edges=[...p.edges];
   assert.deepEqual(p.pawnMoves().sort((a,b)=>a-b),moves(s).map(encode).sort((a,b)=>a-b));
   for(let a=81;a<209;a++)assert.equal(p.wallLegal(a),validWall(s,decode(a)));
   const list=p.actions();for(const a of [list[0],list.at(-1)]){const u=p.make(a);assert.equal(p.hash,p.calculateHash());p.unmake(u);assert.equal(p.hash,hash);assert.equal(p.signature(),sig);assert.deepEqual([...p.edges],edges);}
   if(ply%18===0){const engine=new SearchEngine();engine.deadline=Infinity;engine.nodes=0;engine.nodeLimit=Infinity;assert.deepEqual(engine.ordered(p,undefined,0).sort((a,b)=>a-b),list.slice().sort((a,b)=>a-b));assert.equal(p.signature(),sig);}
   s=apply(s,decode(list[rand()%list.length]));
 }}
});
test('takes immediate winning jump',()=>{const s=initial();s.p=[{x:4,y:2},{x:4,y:1}];const r=new SearchEngine().search(s,{ms:150,maxDepth:3});assert.deepEqual(r.pv[0],{type:'move',x:4,y:0});assert(r.score>29000);});
test('blocks immediate defeat instead of walking forward',()=>{const s=initial();s.p=[{x:0,y:5},{x:4,y:7}];const r=new SearchEngine().search(s,{ms:700,maxDepth:2});assert(r.depth>=2);assert(legal(s,r.pv[0]));const n=apply(s,r.pv[0]);assert(!moves(n).some(a=>a.y===8),JSON.stringify(r));});
test('both sides find one-move finish; terminal search has no action',()=>{for(const t of [0,1]){const s=initial();s.turn=t;s.p[t]={x:0,y:t===0?1:7};const r=new SearchEngine().search(s,{ms:100});assert.equal(r.pv[0].y,t===0?0:8);const n=apply(s,r.pv[0]);assert.equal(new SearchEngine().search(n).pv.length,0);}});
test('deadline abort restores input and returns legal fallback',()=>{const s=initial(),before=structuredClone(s);const r=new SearchEngine().search(s,{ms:1});assert(legal(s,r.pv[0]));assert.deepEqual(s,before);});
test('same engine searches again after cancellation budget',()=>{const e=new SearchEngine(),s=initial();e.search(s,{ms:1});const r=e.search(s,{ms:400,maxDepth:2});assert(r.depth>=2);assert(legal(s,r.pv[0]));for(const a of r.pv){assert(legal(s,a));Object.assign(s,apply(s,a));}});
