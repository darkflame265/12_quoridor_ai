import {createRuntimeEngine} from './runtime-engine.js';
import {SearchEngine} from './search.js';
let enginePromise,legacyPromise;
const runtime=()=>enginePromise??=fetch('/atlas.wasm').then(r=>{if(!r.ok)throw Error('WASM download failed');return r.arrayBuffer();}).then(createRuntimeEngine).catch(()=>{
 const fallback=new SearchEngine();return {search:(state,options)=>({...fallback.search(state,options),engine:'Atlas 3.1 · JS fallback'})};
});
onmessage=async({data:{state,ms,id,offset=0,stride=1,engine:selection='atlas4'}})=>{
  try {
    if(!['atlas4','atlas3'].includes(selection))throw Error('Unknown engine');
    const engine=selection==='atlas3'?await (legacyPromise??=import('./baselines/atlas3.js').then(m=>new m.SearchEngine())):await runtime();
    const result=engine.search(state,{ms,offset,stride,onProgress:r=>postMessage({id,...r,done:false})});
    postMessage({id,...result,done:true});
  } catch(error) { postMessage({id,error:`AI 분석 실패: ${error.message}`}); }
};
