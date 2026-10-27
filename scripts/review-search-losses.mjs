import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {initial,apply,legal,moves} from '../src/engine.js';
import {Position} from '../src/search.js';
import {digest} from '../evaluation/native-policy.mjs';
const [directory,out]=process.argv.slice(2);if(!directory||!out)throw Error('Specify validation arena and a fresh output file');
const bytes=await readFile(path.join(directory,'report.json')),report=JSON.parse(bytes);
if(report.status!=='completed'||report.split!=='validation')throw Error('Use completed exposed validation data, not reserved holdout');
const cases=[];let wallDecisions=0;
for(const entry of report.games.filter(g=>g.result==='loss')){
 const file=path.join(directory,entry.file),raw=await readFile(file);if(digest(raw)!==entry.sha256)throw Error('Replay changed');
 const game=JSON.parse(raw);let state=initial();
 for(const [ply,action] of game.records.entries()){
  if(!legal(state,action))throw Error('Illegal loss replay');
  const next=apply(state,action);
  if(ply>=game.openingPlies&&state.turn===game.candidateSide&&action.type==='wall'){
   wallDecisions++;const p=new Position(state),q=new Position(next),t=state.turn,enemy=1-t;
   const own=p.distances(t),opponent=p.distances(enemy),selfDelay=q.distances(t)-own,enemyDelay=q.distances(enemy)-opponent;
   const immediateWin=moves(state,enemy).some(a=>a.y===(enemy===0?0:8));
   if(opponent<=2&&!immediateWin||enemyDelay-selfDelay-1<=0)cases.push({source:file,sourceSha256:digest(raw),ply,state,records:game.records.slice(0,ply),action,opponentDistance:opponent,opponentHasImmediateWin:immediateWin,selfDelay,enemyDelay,netAfterTempo:enemyDelay-selfDelay-1,warning:'Exposure diagnosis only. Neutral immediate distance gain does not prove the wall is a mistake.'});
  }
  state=next;
 }if(state.winner!==game.winner)throw Error('Loss result mismatch');
}
const result={format:'atlas-search-loss-review-v1',source:path.join(directory,'report.json'),sourceSha256:digest(bytes),wallDecisions,reviewCases:cases.length,nearGoalWithoutImmediateWin:cases.filter(c=>c.opponentDistance<=2&&!c.opponentHasImmediateWin).length,cases,developmentOnly:true,warning:'Selected losing-game observations do not establish causes or optimal replacement moves.'};
await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({wallDecisions,reviewCases:cases.length,nearGoalWithoutImmediateWin:result.nearGoalWithoutImmediateWin}));
