import assert from 'node:assert/strict';
import {createSigma4Service} from '../server/sigma4-service.mjs';
import {SigmaProcess} from './sigma4-budget-process.mjs';
import {chooseWeightedResearchCandidate} from './sigma4-weighted-research-choice.mjs';
import {initial,apply,clone,legal} from '../src/engine.js';

Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1'});
const testState=initial();
const reference=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
const service=createSigma4Service();
const seedRandom=state=>{
 const seedText=JSON.stringify([state.p,state.walls,state.left,state.turn,state.historyStates?.length??0]);
 let seed=2166136261;
 for(let i=0;i<seedText.length;i++)seed=Math.imul(seed^seedText.charCodeAt(i),16777619)>>>0;
 return ()=>{seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;return(seed>>>0)/4294967296;};
};
try{
 await Promise.all([reference.health(),service.client.health()]);
 await new Promise((resolve,reject)=>{service.server.once('error',reject);service.server.listen(0,'127.0.0.1',resolve);});
 const url='http://127.0.0.1:'+service.server.address().port;
 const health=await(await fetch(url+'/health')).json();
 assert.equal(health.engineInfo.id,'sigma4');
 assert.match(health.engineInfo.label,/weighted V3/i);
 assert.match(health.engineInfo.version,/weighted V3/i);
 const state=initial(),history=[];
 for(const move of [{type:'move',x:4,y:7},{type:'move',x:4,y:1},{type:'wall',x:2,y:5,o:'v'},{type:'move',x:4,y:2}]){
  assert(legal(state,move));history.push(clone(state));Object.assign(state,apply(state,move));
 }
 const prepared={...state,historyStates:history};
 const ref=await reference.search(prepared);
 const expected=chooseWeightedResearchCandidate(prepared,ref,seedRandom(prepared),{
  rate:.72,temperature:1.2,qTemperature:.15,maxQDrop:.15,minVisits:5,minVisitRatio:.06
 });
 const req=async id=>{
  const response=await fetch(url+'/search',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({id,session:'weighted-v3-test',state:prepared,ms:500,cores:1})
  });
  assert.equal(response.status,200);
  const parts=(await response.text()).trim().split('\n').map(JSON.parse);
  const r=parts.at(-1);
  assert.equal(r.done,true);
  assert(!r.error,r.error);
  assert(legal(prepared,r.pv[0]));
  assert.equal(r.sigma4.policy,'original-weighted-v3-visit-q');
  assert.equal(r.simulations,200);
  return r;
 };
 const deployed=await req('v3-1');
 assert.deepEqual(deployed.pv[0],expected.action,'deployed weighted choice differs from reference');
 assert.deepEqual(deployed.sigma4.baseAction,ref.pv[0],'deployed root differs from 200-sim research worker');
 const repeat=await req('v3-2');
 assert.deepEqual(repeat.pv[0],deployed.pv[0],'same board must yield reproducible weighted sample');
 console.log(JSON.stringify({pass:true,engineInfo:health.engineInfo,root:ref.pv[0],
  weighted:deployed.pv[0],reason:deployed.sigma4.reason,
  simulations:deployed.simulations,deterministicRepeat:true}));
}finally{await Promise.all([reference.close(),service.close()]);}
