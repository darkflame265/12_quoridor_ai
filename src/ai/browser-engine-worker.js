import * as ort from 'onnxruntime-web/wasm';
import wasmUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm?url';
import mjsUrl from '../../node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.mjs?url';
import {searchBrowser} from './browser-search.js';
import {encodePosition} from './browser-position.js';
// Pages cannot supply COOP/COEP headers. Single-thread WASM works without SAB.
ort.env.wasm.numThreads=1;ort.env.wasm.proxy=false;
ort.env.wasm.wasmPaths={wasm:new URL(wasmUrl,self.location.origin).href,mjs:new URL(mjsUrl,self.location.origin).href};
let loading,session;const cancelled=new Set(),queue=[];let running=false;
async function ready(){
 if(!loading)loading=(async()=>{
  const response=await fetch(new URL('models/best.onnx',new URL(import.meta.env.BASE_URL,self.location.origin)),{signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('AI 모델 다운로드 실패. 연결을 확인하고 다시 시도하세요.');
  session=await ort.InferenceSession.create(await response.arrayBuffer(),{executionProviders:['wasm'],graphOptimizationLevel:'all'});
  await infer(new Float32Array(648));return session;
 })().catch(e=>{loading=null;throw e;});
 return loading;
}
const inferenceCache=new Map();
async function infer(input){
 const key=Array.from(new Uint32Array(input.buffer,input.byteOffset,input.length)).join(',');
 if(inferenceCache.has(key)){const r=inferenceCache.get(key);inferenceCache.delete(key);inferenceCache.set(key,r);return r;}
 const result=await session.run({input:new ort.Tensor('float32',input,[1,8,9,9])});
 const values=Object.values(result),policy=values.find(x=>x.data.length===136),value=values.find(x=>x.data.length===1);
 if(!policy||!value)throw Error('Unsupported AI model outputs');
 const r={policy:Float32Array.from(policy.data),value:Number(value.data[0])};inferenceCache.set(key,r);
 if(inferenceCache.size>1024)inferenceCache.delete(inferenceCache.keys().next().value);return r;
}
async function drain(){
 if(running)return;running=true;
 try{while(queue.length){const job=queue.shift();try{
  if(cancelled.has(job.id))continue;await ready();if(cancelled.has(job.id))continue;
  if(job.type==='probe'){postMessage({id:job.id,ready:true});continue;}
  if(job.type==='evaluate'){postMessage({id:job.id,result:await infer(encodePosition(job.state))});continue;}
  const result=await searchBrowser(job.state,infer,{...job.options,cancelled:()=>cancelled.has(job.id)});
  if(!cancelled.has(job.id))postMessage({id:job.id,result});
 }catch(e){if(!cancelled.has(job.id))postMessage({id:job.id,error:e.message});}finally{cancelled.delete(job.id);}}}
 finally{running=false;}
}
onmessage=e=>{const job=e.data;if(job.type==='cancel'){cancelled.add(job.id);if(cancelled.size>256)cancelled.delete(cancelled.values().next().value);return;}queue.push(job);drain();};
