import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,clone,legal,distance} from '../src/engine.js';
import {SigmaProcess} from './sigma4-budget-process.mjs';
const source=JSON.parse(readFileSync('evaluation/sigma4-sigma3-counterfactual-rollouts-20261105.json'));
const rows=[];
Object.assign(process.env,{SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:'0',SIGMA2_DETERMINISTIC:'1',SIGMA2_REUSE:'0'});
const worker=new SigmaProcess({variant:'sigma3',simulations:200,bitsetWall:true});
try{
 await worker.health();
 for(const sc of source.settings.scenarioMetadata){
  let s=initial(),h=[],g=JSON.parse(readFileSync('evaluation/sigma4-bitset200-vs-sigma23-20261105.json')).games.find(g=>g.fixture===sc.fixture&&g.candidateSide===sc.seat&&g.opponent==='sigma3');
  for(let k=0;k<sc.ply;k++){h.push(clone(s));s=apply(s,g.actions[k]);}
  const result=await worker.search({...s,historyStates:h.slice(-48)});
  const candidates=(result.diagnostics?.rootChildren??[]).slice(0,12).map((node,i)=>({...node,rank:i+1,ownDist:distance(apply(s,node.action),s.turn),opponentDist:distance(apply(s,node.action),1-s.turn)}));
  rows.push({fixture:sc.fixture,ply:sc.ply,seat:sc.seat,recorded:sc.recorded,progress:sc.alternative,native:result.pv[0],rootValue:result.value,candidates});
  console.log('ROOT',sc.ply,sc.fixture,JSON.stringify(candidates.slice(0,6).map(c=>({rank:c.rank,action:c.action,q:c.qFromRoot,visits:c.visits,own:c.ownDist,opp:c.opponentDist}))));
 }
}finally{await worker.close();}
writeFileSync('evaluation/sigma4-sigma3-counterfactual-root-audit-20261105.json',JSON.stringify({version:'sigma4-sigma3-branch-root-audit-v1',rows},null,2)+'\n');
