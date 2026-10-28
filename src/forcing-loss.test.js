import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {legal,apply} from './engine.js';
import {Position} from './search.js';

test('archived missed threat agrees with exhaustive independent legal-wall evaluation',()=>{
 const f=JSON.parse(readFileSync(new URL('../evaluation/fixtures/forcing63-threat-gap.json',import.meta.url)));
 const state=structuredClone(f.state);state.turn=1-f.target;
 const p=new Position(state),own=p.distances(state.turn),enemy=p.distances(f.target);
 const gain=action=>{const q=new Position(apply(state,action));return q.distances(f.target)-enemy-(q.distances(state.turn)-own)-1;};
 let best=0;
 for(const o of ['h','v'])for(let y=0;y<8;y++)for(let x=0;x<8;x++) {
  const wall={type:'wall',o,x,y};if(legal(state,wall))best=Math.max(best,gain(wall));
 }
 assert.ok(legal(state,f.wall));assert.equal(gain(f.wall),f.expectedGain);assert.equal(best,f.expectedGain);
 assert.ok(best>f.fast4);assert.ok(best>f.fast8);
});
