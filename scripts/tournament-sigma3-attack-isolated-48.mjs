import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-attack-match-fixtures.json','utf8'));
const out='reports/sigma-selfplay/sigma3-attack-isolated-48.json';
const report={version:'sigma3-attack-isolated-paired-v1',fixtures:fixtures.length,controlGames:fixtures.length*2,experimentalGames:fixtures.length*2,exploration:0,simulations:200,processRestartPerGame:true,results:[]};
if(existsSync(out)&&process.argv.includes('--resume')){
 const x=JSON.parse(readFileSync(out,'utf8'));
 if(x.version!==report.version||x.fixtures!==report.fixtures)throw Error('bad resume');
 report.results=x.results;
}else if(existsSync(out))throw Error('existing report; pass --resume');
process.env.SIGMA_EXPLORATION='0';
process.env.SIGMA2_DETERMINISTIC='1';
process.env.SIGMA2_REUSE='1';
process.env.SIGMA3_FOCUS='0';
process.env.SIGMA_DIAGNOSTICS='1';
for(let i=report.results.length;i<fixtures.length*4;i++){
 const fixture=Math.floor(i/4),sigma3Side=i%2,enabled=i%4>=2,f=fixtures[fixture];
 process.env.SIGMA3_TACTICAL_PROOF='0';
 process.env.SIGMA3_ATTACK_PROOF=enabled?'1':'0';
 process.env.SIGMA_SEED=String(20261103+fixture*11+sigma3Side);
 let s=clone(f.s),history=f.history.slice(-48),plies=0,proofs=[],trace=[],elapsed=[0,0],moves=[0,0];
 const engines=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma3'})];
 try{
  while(s.winner===null&&plies<130){
   const v=s.turn===sigma3Side?1:0;
   const r=await engines[v].search({...s,historyStates:history.slice(-48)});
   const action=r.pv?.[0];
   if(!legal(s,action))throw Error('illegal at '+i+' '+plies);
   if(r.diagnostics?.loopDebug?.sigma3AttackProof)proofs.push({ply:plies,...r.diagnostics.loopDebug.sigma3TacticalProof});
   if(plies<24)trace.push({ply:plies,variant:v?'sigma3':'sigma2',action});
   elapsed[v]+=r.elapsedMs;moves[v]++;
   history.push(clone(s));s=apply(s,action);plies++;
  }
  const winnerVariant=s.winner===null?null:s.winner===sigma3Side?'sigma3':'sigma2';
  const item={fixture,game:i+1,sigma3Side,enabled,winnerVariant,plies,cutoff:s.winner===null,proofs,trace,avgMs:elapsed.map((x,j)=>moves[j]?Math.round(x/moves[j]):null),finalDist:[distance(s,0),distance(s,1)]};
  report.results.push(item);
  writeFileSync(out,JSON.stringify(report,null,2));
  console.log('game',i+1,'/',fixtures.length*4,'fixture',fixture,'side',sigma3Side,'enabled',enabled,'winner',winnerVariant,'plies',plies,'proofs',proofs.length);
 }finally{await Promise.all(engines.map(x=>x.close()))}
}
for(const enabled of [false,true]){
 const a=report.results.filter(x=>x.enabled===enabled);
 console.log('SUMMARY',enabled?'active':'control',JSON.stringify({games:a.length,sigma3:a.filter(x=>x.winnerVariant==='sigma3').length,sigma2:a.filter(x=>x.winnerVariant==='sigma2').length,cutoffs:a.filter(x=>x.cutoff).length,proofs:a.reduce((s,x)=>s+x.proofs.length,0),escapes:a.reduce((s,x)=>s+x.proofs.filter(p=>p.escaped).length,0)}));
}
