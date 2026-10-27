import test from 'node:test';
import assert from 'node:assert/strict';
import {Worker} from 'node:worker_threads';
import {EnginePool} from './engine-pool.js';
import {initial,legal,apply} from './engine.js';
function factory(){const worker=new Worker(new URL('../scripts/test-fixtures/browser-worker-node.mjs',import.meta.url));const adapter={onmessage:null,onerror:null,postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.(e));return adapter;}
test('actual two-Worker WASM search returns a legal completed-depth result',async()=>{const pool=new EnginePool({workers:2,workerFactory:factory});try{const r=await pool.search(initial(),{ms:150});assert(r.workers===2);assert(r.depth>0);let s=initial();for(const a of r.pv){assert(legal(s,a));s=apply(s,a);}}finally{pool.dispose();}});
test('cancelling ponder does not leak a stale result into the next search',async()=>{const pool=new EnginePool({workers:2,workerFactory:factory});try{const pending=pool.search(initial(),{ms:1000,ponder:true});const rejected=assert.rejects(pending,{name:'AbortError'});pool.cancel();await rejected;const s=apply(initial(),{type:'move',x:4,y:7});const r=await pool.search(s,{ms:80});assert(legal(s,r.pv[0]));assert(!pool.active);}finally{pool.dispose();}});
