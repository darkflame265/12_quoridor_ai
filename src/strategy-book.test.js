import test from 'node:test';
import assert from 'node:assert/strict';
import {bookCases,makeBookReplay,wallEffect,rotateAction} from '../evaluation/strategy-book.mjs';
import {initial,legal,apply,distance} from './engine.js';
import {replayRecords,positionKey} from './spectator.js';
import {rotate} from '../evaluation/suite.js';

test('book diagrams conserve resources and have exact legal replay prefixes',()=>{
 const cases=bookCases();assert.equal(cases.length,30);
 for(const c of cases){
  const s=c.state;assert.equal(s.left[0]+s.left[1]+s.walls.length,20);
  for(const t of [0,1])assert.equal(s.left[t]+s.walls.filter(w=>w.owner===t).length,10);
  let base=initial();
  for(const w of s.walls){base.turn=w.owner;assert.ok(legal(base,w),c.id);base=apply(base,w);}
  assert.ok(distance(s,0)<100&&distance(s,1)<100,c.id);
  for(const a of c.compare)assert.ok(legal(s,a),`${c.id} comparison`);
  assert.equal(positionKey(replayRecords(makeBookReplay(s)).state),positionKey(s),c.id);
 }
});
test('wall gain is color symmetric and accounts for the placement turn',()=>{
 for(const c of bookCases())for(const a of c.compare){
  const effect=wallEffect(c.state,a);assert.deepEqual(effect,wallEffect(rotate(c.state),rotateAction(a)));
  assert.equal(effect.net,effect.opponentDelay-effect.ownDelay-1);
  const empty=structuredClone(c.state);empty.left[empty.turn]=0;assert.equal(wallEffect(empty,a),null);
 }
});
test('a tempting edge wall still admits the illustrated backdoor response',()=>{
 const c=bookCases().find(c=>c.id==='backdoor/balanced/normal');
 const n=apply(c.state,c.compare[0]),response={type:'wall',o:'v',x:1,y:5};
 assert.ok(legal(n,response));const next=apply(n,response);
 assert.ok(distance(next,0)<100&&distance(next,1)<100);
});
test('preparatory walls and chamber attacks have distinct immediate effects',()=>{
 const rows=bookCases(),find=id=>rows.find(c=>c.id===`${id}/balanced/normal`);
 const chamber=find('chamber-horizontal');assert.equal(wallEffect(chamber.state,chamber.compare[0]).net,3);
 const net=find('long-net');assert.equal(wallEffect(net.state,net.compare[0]).net,1);
 assert.equal(wallEffect(net.state,net.compare[1]).net,-1);
 const edge=find('inside-edge');assert.equal(wallEffect(edge.state,edge.compare[0]).net,-1);
 assert.equal(wallEffect(edge.state,edge.compare[1]).net,1);
 // A preparation can be strategically useful despite a negative immediate
 // effect. These numbers deliberately do not label it as a bad move.
});
