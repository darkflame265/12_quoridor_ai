import {parentPort} from 'node:worker_threads';
import {readFile} from 'node:fs/promises';
globalThis.onmessage=null;
globalThis.postMessage=data=>parentPort.postMessage(data);
globalThis.fetch=async()=>new Response(await readFile(new URL('../../public/atlas.wasm',import.meta.url)));
await import('../../src/ai-worker.js');
parentPort.on('message',data=>globalThis.onmessage({data}));
