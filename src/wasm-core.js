// The same ABI is used by browser Workers, Node evaluation, and Python's bridge.
export async function createWasmEngine(bytes){
 let instance,onProgress=()=>{};const encoder=new TextEncoder(),decoder=new TextDecoder();
 const imports={env:{now_ms:()=>performance.now(),progress:(ptr,len)=>onProgress(JSON.parse(decoder.decode(new Uint8Array(instance.exports.memory.buffer,ptr,len))))}};
 const result=await WebAssembly.instantiate(bytes,imports);instance=result.instance??result;
 const api=instance.exports;
 function request(state,fn,args=[]){const encoded=encoder.encode(JSON.stringify(state)),ptr=api.q_alloc(encoded.length);new Uint8Array(api.memory.buffer,ptr,encoded.length).set(encoded);let out;
  try{out=fn(ptr,encoded.length,...args);const len=api.q_len();try{const value=JSON.parse(decoder.decode(new Uint8Array(api.memory.buffer,out,len)));if(value.error)throw Error(value.error);return value;}finally{api.q_free(out,len);}}finally{api.q_free(ptr,encoded.length);}
 }
 return {inspect:state=>request(state,api.q_inspect),search(state,{ms=2000,maxDepth=40,nodeLimit=0,offset=0,stride=1,onProgress:callback=()=>{}}={}){onProgress=callback;try{return request(state,api.q_solve,[ms,maxDepth,nodeLimit,offset,stride]);}finally{onProgress=()=>{};}}};
}
