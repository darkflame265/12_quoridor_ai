import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {legal,distance} from '../src/engine.js';
const source='reports/sigma-selfplay/sigma3-vs-sigma2-seed20261103-24.json';
const records=JSON.parse(readFileSync(source,'utf8')).completed;
const positions=[], seen=new Set();
for(const game of records.filter(g=>g.winnerVariant==='sigma3')){
  for(const target of [14,22,30]){
    const t=game.trace.filter(t=>t.ply>=target && (t.side+game.index)%2===0 && t.state.winner===null)[0];
    if(!t)continue;
    const k=JSON.stringify([t.state.p,t.state.walls,t.state.left,t.state.turn]);
    if(seen.has(k))continue;
    seen.add(k);
    positions.push({game:game.index,ply:t.ply,phase:t.ply<18?'early':t.ply<30?'middle':'late',state:t.state,oldAction:t.action,oldRoot:t.diagnostics?.rootChildren?.slice(0,5),history:game.trace.slice(Math.max(0,t.ply-48),t.ply).map(x=>x.state)});
  }
  if(positions.length>=12)break;
}
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='0';
process.env.SIGMA3_FOCUS='0';
const baseline=new SigmaProcess({variant:'sigma2'});
process.env.SIGMA3_RESEARCH_SIMS='1200';
const deep=new SigmaProcess({variant:'sigma3'});
const report={version:'sigma2-loss-deep-research-v1',source,baselineSims:200,researchSims:1200,randomExploration:0,treeReuse:false,positions:[]};
try {
  for(let i=0;i<positions.length;i++){
    const p=positions[i];
    const state={...p.state,historyStates:p.history};
    const b=await baseline.search(state);
    const d=await deep.search(state);
    if(!legal(state,b.pv[0])||!legal(state,d.pv[0]))throw Error('Illegal');
    const result={index:i+1,game:p.game,ply:p.ply,phase:p.phase,state:p.state,originalAction:p.oldAction,baseline:{action:b.pv[0],ms:b.elapsedMs,value:b.value,root:b.diagnostics?.rootChildren?.slice(0,8)},deep:{action:d.pv[0],ms:d.elapsedMs,value:d.value,root:d.diagnostics?.rootChildren?.slice(0,8)},changed:JSON.stringify(b.pv[0])!==JSON.stringify(d.pv[0]),pathBefore:[distance(state,0),distance(state,1)]};
    report.positions.push(result);
    mkdirSync('evaluation',{recursive:true});
    writeFileSync('evaluation/sigma3-loss-deep-research.json',JSON.stringify(report,null,2));
    console.log('position',i+1,'game',p.game,'ply',p.ply,'baseline',JSON.stringify(b.pv[0]),'deep',JSON.stringify(d.pv[0]),'changed',result.changed,'ms',Math.round(d.elapsedMs));
  }
}finally{await baseline.close();await deep.close();}
console.log('SUMMARY',JSON.stringify({positions:report.positions.length,changed:report.positions.filter(p=>p.changed).length,meanDeepMs:Math.round(report.positions.reduce((s,p)=>s+p.deep.ms,0)/report.positions.length)}));
