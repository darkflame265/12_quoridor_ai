import test from 'node:test';import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {NativeProcess} from '../server/native-process.mjs';import {actionKey} from '../evaluation/native-diagnostics.mjs';
const executable=new URL(`../diagnostic-engine/target/release/quoridor-diagnostic${process.platform==='win32'?'.exe':''}`,import.meta.url);
test('archived shallow LMR gap remains reproducible against the full-width reference',{skip:!existsSync(executable)},async()=>{
 const f=JSON.parse(readFileSync(new URL('../evaluation/fixtures/diagnostic66-lmr-gap.json',import.meta.url)));
 for(const [name,full] of [['selective',false],['fullWidth',true]]){
  const client=new NativeProcess({executable:fileURLToPath(executable),profile:'candidate',env:{QUORIDOR_DIAGNOSTIC_FULL_WIDTH:full?'1':'0'}});
  try{await client.health();const r=await client.search(f.state,{ms:15000,cores:f.cores,maxDepth:f.maxDepth});assert.equal(r.depth,f.maxDepth);assert.equal(r.score,f[name].score);assert.equal(actionKey(r.pv[0]),actionKey(f[name].action));}finally{client.close();}
 }
});
