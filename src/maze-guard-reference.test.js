import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {fileURLToPath} from 'node:url';
import {NativeProcess} from '../server/native-process.mjs';import {actionKey} from '../evaluation/native-diagnostics.mjs';
const executable=fileURLToPath(new URL(`../maze-guard-engine/target/release/quoridor-maze-guard${process.platform==='win32'?'.exe':''}`,import.meta.url));
test('maze-only guard recovers the archived full-width move without changing evaluation',{skip:!existsSync(executable)},async()=>{
 const f=JSON.parse(readFileSync(new URL('../evaluation/fixtures/diagnostic66-lmr-gap.json',import.meta.url))),client=new NativeProcess({executable,profile:'candidate'});
 try{await client.health();const r=await client.search(f.state,{ms:15000,cores:1,maxDepth:3});assert.equal(r.depth,3);assert.equal(r.score,f.fullWidth.score);assert.equal(actionKey(r.pv[0]),actionKey(f.fullWidth.action));}finally{client.close();}
});
