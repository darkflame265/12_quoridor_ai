import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {verifyMazeBuild,assessMaze,mazeModes,mazeSearchModes} from '../evaluation/maze-candidate-policy.mjs';
import {searchFixtures} from '../evaluation/search-fixtures.mjs';
import {nativeExecutable} from '../server/native-process.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {nativeFixtures} from '../evaluation/native-fixtures.mjs';
import {initial,apply,legal} from '../src/engine.js';
import {tactics,checkTactic} from '../evaluation/suite.js';
const args=process.argv.slice(2),directory=args[0];if(!directory)throw Error('Specify the arena directory');
const bytes=await readFile(path.join(directory,'report.json')),report=JSON.parse(bytes);
if(report.format!=='atlas-maze-candidate-arena-v3'||!mazeModes.includes(report.mode)||!mazeSearchModes.includes(report.searchMode)||!['native53-v3','search55-v1'].includes(report.cohort))throw Error('Historical or invalid arena mode; use its recorded source version for verification');
if(report.status!=='completed'||JSON.stringify(report.identity)!==JSON.stringify(verifyMazeBuild())||report.baselineBinary!==digest(await readFile(nativeExecutable)))throw Error('Arena inputs changed');
for(const [f,h] of Object.entries(report.sources))if(digest(await readFile(f))!==h)throw Error('Arena sources changed');
if(report.tactics.length!==16||report.tactics.some((t,i)=>t.id!==tactics()[i].id||t.pass!==checkTactic(tactics()[i],t.action)))throw Error('Tactics mismatch');
const counts={win:0,loss:0,draw:0},totals={candidate:{moves:0,elapsedMs:0,overruns:0},baseline:{moves:0,elapsedMs:0,overruns:0}},seen=new Set();
for(const e of report.games){
 const filename=path.resolve(directory,e.file);if(!filename.startsWith(path.resolve(directory)+path.sep))throw Error('Replay outside report');
 const data=await readFile(filename);if(digest(data)!==e.sha256)throw Error('Replay hash mismatch');const game=JSON.parse(data),opening=(report.cohort==='search55-v1'?searchFixtures(report.split,e.suite,e.openingIndex+1):nativeFixtures(report.split,e.suite,e.openingIndex+1,'v3'))[e.openingIndex];
 const key=JSON.stringify([e.suite,e.openingIndex,e.candidateSide]);if(seen.has(key))throw Error('Duplicate arena game');seen.add(key);
 if(JSON.stringify(game.records.slice(0,game.openingPlies))!==JSON.stringify(opening.records)||game.openingPlies!==opening.records.length||game.trace.length!==game.records.length-game.openingPlies||game.candidateSide!==e.candidateSide)throw Error('Opening metadata mismatch');
 let state=initial();for(const [i,a] of game.records.entries()){
  if(!legal(state,a))throw Error('Illegal replay');
  if(i>=game.openingPlies){const t=game.trace[i-game.openingPlies],role=state.turn===e.candidateSide?'candidate':'baseline';if(t.ply!==i||t.turn!==state.turn||t.role!==role||JSON.stringify(t.action)!==JSON.stringify(a)||!Number.isFinite(t.elapsedMs)||t.elapsedMs<0)throw Error('Trace mismatch');const total=totals[role];total.moves++;total.elapsedMs+=t.elapsedMs;total.overruns+=Number(t.elapsedMs>report.ms*1.2+5);}
  state=apply(state,a);
 }
 const result=state.winner===null?'draw':state.winner===e.candidateSide?'win':'loss';if(result!==e.result||result!==game.result||state.winner!==game.winner||e.reason!==game.reason||!e.replayValidated)throw Error('Result mismatch');counts[result]++;
}
if(report.games.length!==report.pairs*4||JSON.stringify(totals)!==JSON.stringify(report.timing)||JSON.stringify(counts)!==JSON.stringify(report.summary))throw Error('Arena totals mismatch');
const result={verifiedGames:report.games.length,reportSha256:digest(bytes),summary:counts,assessmentWithoutHoldout:assessMaze(report,null),productionActive:false};
if(args.includes('--save'))await writeFile(path.join(directory,'verification.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
