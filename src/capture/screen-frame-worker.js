import {recognizeBoard} from './screen-recognition.js';
import {createSourceTemplates,readSourceContext} from './source-context.js';
let templates;
self.onmessage=({data})=>{
 try{
  const {pixels,rect,gap,knownWalls,bottom,readContext}=data;
  const detected=recognizeBoard(pixels,rect,{gap,knownWalls});
  let context=null;
  if(readContext){
   templates??=createSourceTemplates({createElement:()=>new OffscreenCanvas(128,40)});
   context=readSourceContext(pixels,rect,{gap,knownWalls,templates,board:detected,bottom});
  }
  self.postMessage({detected,context});
 }catch(error){self.postMessage({error:error.message});}
};
