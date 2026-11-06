import fs from 'node:fs';import {SigmaProcess} from '../server/sigma-process.mjs';import {clone,apply,legal} from '../src/engine.js';
for(let [file,count] of [['evaluation/turn21-f4-h8.json',20],['evaluation/turn18-choice.json',17]]){
 let d=JSON.parse(fs.readFileSync(file)),s=clone(d.baseState),hist=[];
 for(let i=0;i<count;i++){hist.push(clone(s));s=apply(s,d.records[i]);}
 for(let variant of ['sigma2','sigma3']){
 let engine=new SigmaProcess({variant});try{
 let r=await engine.search({...s,historyStates:hist});
 console.log(file,variant,JSON.stringify(r.pv[0]),Math.round(r.elapsedMs),JSON.stringify(r.diagnostics?.loopDebug?.sigma3Corridor??null));
 }finally{await engine.close()}}
}