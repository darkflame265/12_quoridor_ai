import test from 'node:test';import assert from 'node:assert/strict';import {existsSync,readFileSync} from 'node:fs';import {fileURLToPath} from 'node:url';import {NativeProcess} from '../server/native-process.mjs';import {actionKey} from '../evaluation/native-diagnostics.mjs';
const executable=fileURLToPath(new URL(`../root-guard-engine/target/release/quoridor-root-guard${process.platform==='win32'?'.exe':''}`,import.meta.url));
test('root-only protection recovers the fixed move while off mode reproduces selective search',{skip:!existsSync(executable)},async()=>{
 const f=JSON.parse(readFileSync(new URL('../evaluation/fixtures/diagnostic66-lmr-gap.json',import.meta.url)));
 for(const [mode,key] of [['off','selective'],['root','fullWidth']]){const client=new NativeProcess({executable,profile:'candidate',env:{QUORIDOR_ROOT_GUARD_MODE:mode}});try{await client.health();const r=await client.search(f.state,{ms:15000,cores:1,maxDepth:3});assert.equal(r.depth,3);assert.equal(r.score,f[key].score);assert.equal(actionKey(r.pv[0]),actionKey(f[key].action));}finally{client.close();}}
});
