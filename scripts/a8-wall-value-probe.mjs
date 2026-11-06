import {readFileSync,writeFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const src=JSON.parse(readFileSync('evaluation/turn18-choice.json','utf8'));
let root=clone(src.baseState),history=[];
for(const a of src.records){history.push(clone(root));root=apply(root,a);}
const report=[];
for(const enabled of [false,true]){
  process.env.SIGMA2_WALL_VALUE_CHECK=enabled?'1':'0';
  process.env.SIGMA_DIAGNOSTICS='1';
  process.env.SIGMA_EXPLORATION='0';
  const p=new SigmaProcess({variant:'sigma2'});
  try{
    const res=await p.search({...root,historyStates:history});
    const q={enabled,chosen:res.pv[0],elapsedMs:res.elapsedMs,rootChildren:res.diagnostics?.rootChildren,debug:res.diagnostics?.loopDebug};
    report.push(q);console.log(JSON.stringify(q));
  }finally{await p.close();}
}
writeFileSync('evaluation/a8-wall-value-probe.json',JSON.stringify(report,null,2));
