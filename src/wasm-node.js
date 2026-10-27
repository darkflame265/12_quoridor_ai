import {readFile} from 'node:fs/promises';
import {createWasmEngine} from './wasm-core.js';
import {createRuntimeEngine} from './runtime-engine.js';
export async function loadWasm(){return createWasmEngine(await readFile(new URL('../public/atlas.wasm',import.meta.url)));}
export async function loadRuntime(){return createRuntimeEngine(await readFile(new URL('../public/atlas.wasm',import.meta.url)));}
