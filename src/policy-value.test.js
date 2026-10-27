import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PolicyValueModel,neuralFeatures,canonicalAction} from './policy-value.js';
test('exported PyTorch model and JS inference agree on canonical features and logits',async()=>{
 const data=JSON.parse(await readFile('models/candidate.json')),fixtures=JSON.parse(await readFile('models/parity.json')),model=new PolicyValueModel(data);
 for(const f of fixtures){assert.deepEqual([...neuralFeatures(f.state)],f.features);const r=model.predict(f.state,f.actions);assert(Math.abs(r.value-f.value)<1e-5);for(let i=0;i<209;i++)assert(Math.abs(r.logits[i]-f.logits[i])<1e-5);assert(Math.abs(r.policy.reduce((a,b)=>a+b,0)-1)<1e-10);}
});
test('action normalization round-trips squares and both wall orientations',()=>{for(let a=0;a<209;a++)assert.equal(canonicalAction(canonicalAction(a,1),1),a);});
test('a malformed model cannot silently become an inference model',()=>{assert.throws(()=>new PolicyValueModel({format:'wrong'}));});
