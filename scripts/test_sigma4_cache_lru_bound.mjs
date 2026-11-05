import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const data=JSON.parse(readFileSync('evaluation/sigma4-cache100-independent-paired-20261105.json'));
const games=data.games.filter(g=>g.actions?.length>=45);
assert(games.length>=6);
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
let totalHits=0,totalMisses=0,largest=0,checks=0;
const worker=new SigmaProcess({variant:'sigma3',simulations:100,cached:true});
try{
 await worker.health();
 for(const game of games){
  let state=initial(),history=[];
  for(let i=0;i<Math.min(65,game.actions.length);i++){
   if(i>=6&&i%2===0){
    const result=await worker.search({...state,historyStates:history.slice(-48)});
    assert(legal(state,result.pv[0]));
    const stats=result.inferenceCache;
    assert(stats&&stats.entries<=2048,'bounded cache must not exceed 2048');
    totalHits+=stats.hits;totalMisses+=stats.misses;
    largest=Math.max(largest,stats.entries);checks++;
   }
   assert(legal(state,game.actions[i]));
   history.push(clone(state));state=apply(state,game.actions[i]);
   if(largest===2048)break;
  }
  if(largest===2048)break;
 }
}finally{await worker.close();}
assert.equal(largest,2048,'cache cap should be exercised');
const output={version:'sigma4-cache100-lru-bound-v1',checks,totalHits,totalMisses,maxEntries:largest,cap:2048,passed:true};
writeFileSync('evaluation/sigma4-cache100-lru-bound-20261105.json',JSON.stringify(output,null,2)+'\n');
console.log('PASS',JSON.stringify(output));
