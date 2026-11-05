import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const source=JSON.parse(readFileSync('evaluation/sigma4-cache100-independent-paired-20261105.json'));
const games=[source.games.find(g=>g.opponent==='sigma2'&&g.variant==='original200'&&g.candidateSide===0),source.games.find(g=>g.opponent==='weighted200'&&g.variant==='original200'&&g.candidateSide===0)];
const targets=[{game:0,ply:8},{game:1,ply:16},{game:1,ply:28}];
const states=[];
for(let g=0;g<games.length;g++){
 let s=initial(),history=[];
 for(let ply=0;ply<games[g].actions.length;ply++){
  if(targets.some(t=>t.game===g&&t.ply===ply))states.push({id:g+'-'+ply,state:{...clone(s),historyStates:history.slice(-48)}});
  const a=games[g].actions[ply];if(!legal(s,a))throw Error('source mismatch');
  history.push(clone(s));s=apply(s,a);
 }
}
Object.assign(process.env,{SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0',SIGMA_DIAGNOSTICS:'1'});
const worker=new SigmaProcess({variant:'sigma3',simulations:200,hotProfile:true});
const results=[];
try{
 await worker.health();
 for(const p of states){
  const r=await worker.search(p.state);
  if(!r.hotspots?.length)throw Error('missing profile');
  results.push({id:p.id,engineMs:r.elapsedMs,cache:r.inferenceCache,hotspots:r.hotspots});
  console.log('HOT',p.id,'elapsedMs',r.elapsedMs,'hits',r.inferenceCache?.hits,'top',JSON.stringify(r.hotspots.slice(0,10)));
 }
}finally{await worker.close();}
writeFileSync('evaluation/sigma4-200-cache-miss-cprofile-20261105.json',JSON.stringify({version:'sigma4-200-miss-hotspots-v1',results},null,2)+'\n');
