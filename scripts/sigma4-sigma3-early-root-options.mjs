import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal,distance} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const d=JSON.parse(readFileSync('evaluation/sigma4-bitset200-vs-sigma23-20261105.json'));
const targets=[{fixture:'independent-wall-nw-20261105',seat:0,ply:10},{fixture:'independent-wall-nw-20261105',seat:0,ply:16},{fixture:'independent-wall-se-20261105',seat:1,ply:11},{fixture:'independent-wall-se-20261105',seat:1,ply:17}];
const rows=[];
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const worker=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
try{
 await worker.health();
 for(const target of targets){
  const game=d.games.find(g=>g.opponent==='sigma3'&&!g.candidateWon&&g.fixture===target.fixture&&g.candidateSide===target.seat);
  let state=initial(),history=[];
  for(let p=0;p<target.ply;p++){history.push(clone(state));state=apply(state,game.actions[p]);}
  const native=await worker.search({...state,historyStates:history.slice(-48)});
  const children=(native.diagnostics?.rootChildren??[]).slice(0,8);
  const record={...target,recorded:game.actions[target.ply],rootValue:native.value,native:native.pv[0],ownDistance:distance(state,target.seat),enemyDistance:distance(state,1-target.seat),children};
  rows.push(record);console.log('EARLY',target.fixture,target.ply,'recorded',JSON.stringify(record.recorded),'dist',record.ownDistance,record.enemyDistance,'top',JSON.stringify(children.slice(0,5).map(c=>({a:c.action,v:c.visits,q:c.qFromRoot}))));
 }
}finally{await worker.close();}
writeFileSync('evaluation/sigma4-sigma3-early-root-options-20261105.json',JSON.stringify({version:'sigma4-early-root-options',rows},null,2)+'\n');
