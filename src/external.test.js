import test from 'node:test';
import assert from 'node:assert/strict';
import {existsSync} from 'node:fs';
import {createExternalEngine} from '../evaluation/external-adapter.js';
import {initial,legal,apply} from './engine.js';
test('pinned independent MCTS adapter replays both sides and returns legal moves',{skip:!existsSync('.external/quoridor-ai/.git')},async()=>{const engine=await createExternalEngine();let s=initial(),records=[];for(let i=0;i<6;i++){const r=engine.search(s,{ms:20,records});assert(legal(s,r.pv[0]));records.push(r.pv[0]);s=apply(s,r.pv[0]);}});
