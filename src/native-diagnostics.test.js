import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {initial,apply} from './engine.js';
import {reconstructLoss,sampleLosses,exactOutcome,classify,positionKey} from '../evaluation/native-diagnostics.mjs';

test('diagnostic loss extraction replays archived positions and rejects corrupt traces',()=>{
 const game=JSON.parse(readFileSync('reports/native53/validation/games/maze-0-side0.json'));
 const positions=reconstructLoss(game,{file:'test',suite:'maze'});assert(positions.length>0);
 for(const p of positions){let s=initial();for(const a of p.records)s=apply(s,a);assert.equal(positionKey(s),positionKey(p.state));assert.equal(p.state.turn,game.candidateSide);}
 const bad=structuredClone(game);bad.trace[0].turn=1-bad.trace[0].turn;assert.throws(()=>reconstructLoss(bad,{}),/trace/);
 const badResult=structuredClone(game);badResult.winner=1-badResult.winner;assert.throws(()=>reconstructLoss(badResult,{}),/result/);
 const sample=sampleLosses([...positions,...positions],5);assert.equal(sample.length,5);assert.equal(new Set(sample.map(p=>positionKey(p.state))).size,5);
});

test('independent endgame reference distinguishes an immediate win from a lost move',()=>{
 const s=initial();s.left=[0,0];s.p=[{x:0,y:1},{x:8,y:7}];
 assert.equal(exactOutcome(s).outcome,1);
 const win=apply(s,{type:'move',x:0,y:0}),loss=apply(s,{type:'move',x:0,y:2});
 assert.equal(-exactOutcome(win).outcome,1);assert.equal(-exactOutcome(loss).outcome,-1);
 assert.equal(exactOutcome(initial()),null);
});

test('search gaps never become proofs without independent exact outcomes',()=>{
 const a={type:'move',x:4,y:7},b={type:'wall',x:3,y:3,o:'h'};
 const item={short:{pv:[a]},repeat:{pv:[a]},long:{pv:[b]},exactRoot:null,shortBranch:{score:-500,exactOutcome:null},longBranch:{score:500,exactOutcome:null}};
 assert.equal(classify(item).review,'search-sensitive-gap');assert.equal(classify(item).proven,false);
 item.shortBranch.exactOutcome=-1;item.longBranch.exactOutcome=1;assert.equal(classify(item).proven,true);
 item.repeat.pv=[b];assert.equal(classify(item).shortStable,false);
});
