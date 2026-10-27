import test from 'node:test';import assert from 'node:assert/strict';
import {wallContact} from '../evaluation/wall-geometry.mjs';
import {decode} from './search.js';
test('physical wall contacts handle gaps, overlaps, crossings and all pair symmetries',()=>{
 const h=(x,y)=>({type:'wall',o:'h',x,y}),v=(x,y)=>({type:'wall',o:'v',x,y}),mirror=w=>({...w,x:7-w.x}),rotate=w=>({...w,o:w.o==='h'?'v':'h',x:7-w.y,y:w.x});
 assert(!wallContact(h(3,4),v(5,3)));assert(!wallContact(h(3,4),v(3,4)));assert(!wallContact(h(3,4),h(4,4)));assert(wallContact(h(3,4),v(3,3)));assert(wallContact(h(3,4),h(5,4)));
 for(let a=81;a<209;a++)for(let b=81;b<209;b++){const x=decode(a),y=decode(b),expected=wallContact(x,y);assert.equal(expected,wallContact(y,x));assert.equal(expected,wallContact(mirror(x),mirror(y)));assert.equal(expected,wallContact(rotate(x),rotate(y)));}
});
