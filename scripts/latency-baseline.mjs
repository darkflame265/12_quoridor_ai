import {Worker} from 'node:worker_threads';
import {mkdir,writeFile} from 'node:fs/promises';
import {EnginePool} from '../src/engine-pool.js';
import {openings,mazeOpenings} from '../evaluation/suite.js';
import {legal} from '../src/engine.js';
import os from 'node:os';
function factory(){const worker=new Worker(new URL('./test-fixtures/browser-worker-node.mjs',import.meta.url)),adapter={onmessage:null,onerror:null,postMessage:v=>worker.postMessage(v),terminate:()=>worker.terminate()};worker.on('message',data=>adapter.onmessage?.({data}));worker.on('error',e=>adapter.onerror?.(e));return adapter;}
const fixtures=[...openings('validation',3),...mazeOpenings('validation',3)],samples=[];
for(const cores of [1,2,4]){const pool=new EnginePool({workers:cores,workerFactory:factory});try{for(const f of fixtures){const start=performance.now(),r=await pool.search(f.state,{ms:500});if(!legal(f.state,r.pv[0]))throw Error('Illegal baseline move');samples.push({fixture:f.id,cores,latencyMs:performance.now()-start,...r});console.log(f.id,cores,r.depth,r.partitionDepths,Math.round(samples.at(-1).latencyMs));}}finally{pool.dispose();}}
await mkdir('reports/fast-engine',{recursive:true});await writeFile('reports/fast-engine/baseline.json',JSON.stringify({date:new Date().toISOString(),platform:os.platform(),cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,budgetMs:500,samples},null,2));
