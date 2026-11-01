import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {chooseExternal} from './external-mcts-bridge.mjs';
import {legal,apply} from '../src/engine.js';
const simulations=Number(process.argv[2]||100),games=15;
const path=`reports/atlas6-reborn/external-mcts-vs53-${simulations}sim-15.json`;
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'));
const report={candidate:'gorisanson MIT MCTS JS port',opponent:'Atlas5.3 native candidate',simulations,msBudget:500,cores:4,openingsStart:85,games:[],wins:0,losses:0,undecided:0,overruns:0,opponentSha256:createHash('sha256').update(readFileSync(nativeExecutable)).digest('hex')};
mkdirSync('reports/atlas6-reborn',{recursive:true});
for(let i=0;i<games;i++){
 const side=i%2,s=structuredClone(fixtures[85+Math.floor(i/2)].state),a=new NativeProcess({executable:nativeExecutable,profile:'candidate'});
 let state=s,reason='ply-cap',maxExternalMs=0,forfeit=false;
 try{
  await a.health();
  for(let ply=0;ply<200&&state.winner===null;ply++){
   let chosen;try{chosen=state.turn===side?chooseExternal(state,simulations):await a.search(state,{ms:500,cores:4});}catch(error){if(state.turn!==side)throw error;reason='illegal-action-forfeit';forfeit=true;console.log('FORFEIT',i,error.message);break;}
   if(state.turn===side){maxExternalMs=Math.max(maxExternalMs,chosen.elapsedMs);if(chosen.elapsedMs>500)report.overruns++;}
   const move=chosen.pv?.[0];if(!move||!legal(state,move))throw Error('Illegal action game '+i+' ply '+ply+' '+JSON.stringify(move));
   state=apply(state,move);if(state.winner!==null)reason='goal';
  }
 }finally{await a.close();}
 const verdict=forfeit?'loss':state.winner===null?'undecided':state.winner===side?'win':'loss';
 report[verdict==='win'?'wins':verdict==='loss'?'losses':'undecided']++;
 report.games.push({forfeit,fixture:fixtures[85+Math.floor(i/2)].id,side,verdict,reason,maxExternalMs});
 writeFileSync(path,JSON.stringify(report,null,2)+'\n');
 console.log(i+1+'/'+games,verdict,'score',report.wins+'-'+report.losses,'maxMctsMs',maxExternalMs.toFixed(1));
}
console.log('FINAL',JSON.stringify({wins:report.wins,losses:report.losses,undecided:report.undecided,overruns:report.overruns,winRate:100*report.wins/games}));
