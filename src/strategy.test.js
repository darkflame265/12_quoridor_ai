import test from 'node:test';
import assert from 'node:assert/strict';
import {Position,SearchEngine,encode} from './search.js';
import {initial,legal,validWall,apply} from './engine.js';
import {openings,tactics,checkTactic,rotate,wilson} from '../evaluation/suite.js';
test('wall pressure detects chain extension and restores graph and hash',()=>{
 const s=initial();s.p=[{x:4,y:4},{x:8,y:0}];s.walls=[0,2,4].map(x=>({type:'wall',x,y:3,o:'h',owner:0}));s.left=[7,10];
 const p=new Position(s),sig=p.signature(),edges=[...p.edges],hash=p.hash,threat=p.wallPotential(0,12);
 assert(threat.gain>0);assert(threat.delay>=2);assert(threat.wall);assert(validWall(s,threat.wall));
 assert.equal(p.signature(),sig);assert.equal(p.hash,hash);assert.deepEqual([...p.edges],edges);
 assert(p.wallConnections(encode({type:'wall',x:6,y:3,o:'h'}))>0);
});
test('no enemy walls means no wall threat and illegal enclosures are excluded',()=>{
 const s=initial();s.p[0]={x:0,y:8};s.walls=[{type:'wall',x:0,y:7,o:'h'}];const p=new Position(s),r=p.wallPotential(0,128);if(r.wall)assert(validWall(s,r.wall));s.left[1]=0;assert.deepEqual(new Position(s).wallPotential(0),{gain:0,delay:0,wall:null});
});
test('strategy evaluation respects color rotation symmetry',()=>{
 for(const opening of openings('development',8)){const e=new SearchEngine(),a=new Position(opening.state),b=new Position(rotate(opening.state));assert.equal(e.evaluate(a),e.evaluate(b),opening.id);}
});
test('reported wall threats are legal for their attacker in generated mazes',()=>{
 for(const o of openings('development',12))for(const target of [0,1]){const s=structuredClone(o.state);s.turn=1-target;const p=new Position(s),sig=p.signature(),edges=[...p.edges],threat=p.wallPotential(target,12);if(threat.wall)assert(validWall(s,threat.wall),o.id);assert.equal(p.signature(),sig);assert.deepEqual([...p.edges],edges);}
});
test('last defensive wall has greater marginal value than a spare tenth wall',()=>{
 const e=new SearchEngine();const score=n=>{const s=initial();s.left=[n,0];return e.evaluate(new Position(s));};
 assert(score(1)-score(0)>score(10)-score(9));
});
test('split generation is deterministic, legal, distinct, and diversified',()=>{
 const sets=['development','validation','holdout'].map(split=>openings(split,8));assert.deepEqual(sets[0],openings('development',8));for(const set of sets){assert.equal(new Set(set.map(o=>o.style)).size,4);for(const o of set){let s=initial();for(const a of o.records){assert(legal(s,a));s=apply(s,a);}assert.deepEqual(s,o.state);}}
 for(let i=1;i<8;i++)assert.notDeepEqual(sets[0][i].records,sets[1][i].records);
});
test('tactical suite checks both colors',()=>{for(const f of tactics()){const r=new SearchEngine().search(f.state,{ms:500,maxDepth:2});assert(checkTactic(f,r.pv[0]),f.id);}});
test('small sample uncertainty is not represented as certainty',()=>{const [lo,hi]=wilson(8,4);assert(lo<0.5&&hi>0.8);assert.deepEqual(wilson(0,0),[0,1]);});
