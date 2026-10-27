import {createWasmEngine} from './wasm-core.js';
import {SearchEngine} from './search.js';
export async function createRuntimeEngine(bytes){
 const wasm=await createWasmEngine(bytes),endgame=new SearchEngine();
 return {inspect:state=>wasm.inspect(state),search(state,options={}){
  // Preserve the independently verified exact fixed-maze solver.
  if(!state.left[0]&&!state.left[1])return {...endgame.search(state,options),engine:'Atlas 4 · exact endgame'};
  return wasm.search(state,options);
 }};
}
