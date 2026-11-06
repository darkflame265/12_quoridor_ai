import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {SigmaProcess} from '../server/sigma-process.mjs';
import {clone,apply,legal,distance} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const outIndex=process.argv.indexOf('--out');
const resultPath=outIndex>=0?process.argv[outIndex+1]:'reports/sigma-selfplay/sigma3-vs-sigma2-diverse-100.json';
if(!resultPath)throw Error('Missing --out path');
if(existsSync(resultPath)&&!process.argv.includes('--overwrite')&&!process.argv.includes('--resume'))throw Error('Existing 100-game report preserved: pass --resume or --overwrite explicitly');
let report={version:'sigma3-vs-sigma2-50-position-seat-swapped-200-sims',sampleSources:'4 Sigma2 tournament reports',fixtureCount:fixtures.length,simulations:200,exploration:0.15,maxContinuationPlies:130,gamesRequested:fixtures.length*2,results:[]};
if(process.argv.includes('--resume')&&existsSync(resultPath)){const prev=JSON.parse(readFileSync(resultPath,'utf8'));if(prev.version!==report.version||prev.fixtureCount!==fixtures.length||prev.gamesRequested!==report.gamesRequested)throw Error('Resume fixtures mismatch');report=prev;}
process.env.SIGMA_EXPLORATION='0.15';
process.env.SIGMA_DIAGNOSTICS='1';
process.env.SIGMA_SEED='20261103';
const players=[new SigmaProcess({variant:'sigma2'}),new SigmaProcess({variant:'sigma3'})];
try{
 for(let i=report.results.length;i<fixtures.length*2;i++){
  const f=fixtures[Math.floor(i/2)],sigma3Side=i%2===0?0:1;
  let s=clone(f.s),history=f.history.slice(-48),plies=0,corridors=0,corridorCases=[],wallPlacements=[0,0],elapsed=[0,0],movesCount=[0,0],prefix='';
  while(s.winner===null&&plies<130){
   const v=s.turn===sigma3Side?1:0;
   const result=await players[v].search({...s,historyStates:history.slice(-48)});
   const action=result.pv?.[0];
   if(!action||!legal(s,action))throw Error('invalid move game='+i+' ply='+plies+' action='+JSON.stringify(action));
   if(result.diagnostics?.loopDebug?.sigma3Corridor){corridors++;corridorCases.push({ply:plies,details:result.diagnostics.loopDebug.sigma3Corridor})}
   if(action.type==='wall')wallPlacements[v]++;
   elapsed[v]+=result.elapsedMs;movesCount[v]++;
   if(plies<12)prefix+=JSON.stringify(action)+';';
   history.push(clone(s));s=apply(s,action);plies++;
  }
  const winnerVariant=s.winner===null?null:s.winner===sigma3Side?'sigma3':'sigma2';
  const record={game:i+1,fixtureIndex:Math.floor(i/2),phase:f.phase,sigma3Side,winner:s.winner,winnerVariant,plies,cutoff:s.winner===null,corridors,wallPlacements,elapsed,movesCount,firstMoves:prefix,finalDistances:[distance(s,0),distance(s,1)]};
  report.results.push(record);
  writeFileSync(resultPath,JSON.stringify(report,null,2));
  console.log('game',i+1,'/',fixtures.length*2,f.phase,'sigma3Side',sigma3Side,'winner',winnerVariant??'cutoff','plies',plies,'corridors',corridors);
 }
}finally{await Promise.all(players.map(p=>p.close()))}
const r=report.results;console.log('SUMMARY',JSON.stringify({games:r.length,sigma2:r.filter(x=>x.winnerVariant==='sigma2').length,sigma3:r.filter(x=>x.winnerVariant==='sigma3').length,cutoffs:r.filter(x=>x.cutoff).length,corridors:r.reduce((a,x)=>a+x.corridors,0)}));
