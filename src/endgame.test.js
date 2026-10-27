import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,apply,legal} from './engine.js';
import {SearchEngine,solveEndgame,Position,decode} from './search.js';
test('exact wall-free ending finds wins for either color',()=>{
 const table=solveEndgame(initial());
 for(const t of [0,1]){const s=initial();s.left=[0,0];s.turn=t;s.p=t===0?[{x:0,y:1},{x:8,y:5}]:[{x:0,y:3},{x:8,y:7}];const r=new SearchEngine().search(s,{ms:1000});assert(r.exact);assert.equal(r.outcome,1);assert.equal(apply(s,r.pv[0]).winner,t);const q=table.lookup(s.p[0].y*9+s.p[0].x,s.p[1].y*9+s.p[1].x,t);assert.equal(q.outcome,1);}
});
test('retrograde outcome obeys minimax for all nonterminal empty-board states',()=>{
 const s=initial(),table=solveEndgame(s),p=new Position(s);
 for(let a=9;a<81;a++)for(let b=0;b<72;b++)if(a!==b)for(let t=0;t<2;t++){
   p.p=[a,b];p.turn=t;const r=table.lookup(a,b,t),children=p.pawnMoves().map(m=>table.lookup(t===0?m:a,t===1?m:b,1-t));
   if(r.outcome===1)assert(children.some(c=>c.outcome===-1));else if(r.outcome===-1)assert(children.every(c=>c.outcome===1));else{assert(!children.some(c=>c.outcome===-1));assert(children.some(c=>c.outcome===0));}
   assert(p.pawnMoves().includes(r.move));
 }
});
test('exact maze ending returns a legal move',()=>{
 let s=initial();s=apply(s,{type:'wall',x:3,y:3,o:'h'});s=apply(s,{type:'wall',x:5,y:4,o:'v'});s.left=[0,0];const r=new SearchEngine().search(s,{ms:1000});assert(r.exact);assert(legal(s,r.pv[0]));
});
