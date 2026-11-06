import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal} from '../src/engine.js';
const tests=[
 ['evaluation/turn21-f4-h8.json',20,
  {type:'move',x:5,y:5},{type:'wall',x:7,y:1,o:'v'}],
 ['evaluation/turn18-choice.json',17,
  {type:'wall',x:0,y:1,o:'v'},{type:'wall',x:0,y:1,o:'v'}]
];
for(const [file,steps,want2,want3] of tests){
 const src=JSON.parse(readFileSync(file)),history=[];
 let state=clone(src.baseState);
 for(let i=0;i<steps;i++){const a=src.records[i];assert(legal(state,a),file+' at '+i);history.push(clone(state));state=apply(state,a);}
 for(const [variant,expect] of [['sigma2',want2],['sigma3',want3]]){
  const agent=new SigmaProcess({variant});
  try{
   const response=await agent.search({...state,historyStates:history});
   assert.deepEqual(response.pv[0],expect,file+' '+variant);
   assert(legal(state,response.pv[0]),'illegal '+variant);
   console.log('PASS',file,variant,JSON.stringify(response.pv[0]),Math.round(response.elapsedMs)+'ms');
  }finally{await agent.close();}
 }
}