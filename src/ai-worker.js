import {SearchEngine} from './search.js';
const engine = new SearchEngine();
onmessage=({data:{state,ms,id}})=>{
  try {
    const result=engine.search(state,{ms,onProgress:r=>postMessage({id,...r,done:false})});
    postMessage({id,...result,done:true});
  } catch(error) { postMessage({id,error:`AI 분석 실패: ${error.message}`}); }
};
