import {SigmaProcess} from '../server/sigma-process.mjs';
import {legal,apply,clone} from '../src/engine.js';
const s={p:[{x:4,y:2},{x:0,y:7}],walls:[],left:[1,0],turn:0,winner:null};
process.env.SIGMA_EXPLORATION='0';process.env.SIGMA2_REUSE='0';process.env.SIGMA2_DETERMINISTIC='1';process.env.SIGMA_DIAGNOSTICS='1';
for(const on of [false,true]){
 process.env.SIGMA3_ATTACK_PROOF=on?'1':'0';
 const processer=new SigmaProcess({variant:'sigma3'});
 try{
  const r=await processer.search({...s,historyStates:[]});
  console.log(on?'ATTACK ON':'ATTACK OFF',JSON.stringify(r.pv[0]),'proof',JSON.stringify(r.diagnostics?.loopDebug?.sigma3AttackProof),'legal',legal(s,r.pv[0]),'ms',Math.round(r.elapsedMs));
 }finally{await processer.close()}
}
