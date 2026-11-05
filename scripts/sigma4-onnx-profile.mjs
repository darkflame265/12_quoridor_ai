import {writeFileSync} from 'node:fs';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {initial,apply,clone,legal} from '../src/engine.js';
const M=(x,y)=>({type:'move',x,y}),W=(x,y,o)=>({type:'wall',x,y,o});
const samples=[
 {name:'start',actions:[]},
 {name:'midgame-pawns',actions:[M(4,7),M(4,1),M(4,6),M(4,2),M(3,6),M(5,2)]},
 {name:'midgame-wall',actions:[M(4,7),M(4,1),W(3,4,'h'),M(4,2),M(3,7),M(5,2)]}
];
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const report={version:'sigma4-onnx-timing-profile-v1',results:[]};
const worker=new SigmaProcess({variant:'sigma3',simulations:100,profile:true});
try{
 await worker.health();
 for(const f of samples){
  let s=initial(),history=[];
  for(const a of f.actions){history.push(clone(s));s=apply(s,a);}
  const start=performance.now();
  const output=await worker.search({...s,historyStates:history});
  const wallMs=performance.now()-start;
  const p=output.profile;
  if(!p||p.onnxCalls===0)throw Error('onnx instrumentation missing');
  const entry={fixture:f.name,simulations:output.simulations,engineMs:output.elapsedMs,wallMs,onnxCalls:p.onnxCalls,onnxMs:p.onnxMs,nonOnnxMs:output.elapsedMs-p.onnxMs,onnxFraction:p.onnxMs/output.elapsedMs,action:output.pv[0]};
  report.results.push(entry);writeFileSync('evaluation/sigma4-onnx-profile-20261105.json',JSON.stringify(report,null,2)+'\n');
  console.log('PROFILE',JSON.stringify(entry));
 }
}finally{await worker.close();}
