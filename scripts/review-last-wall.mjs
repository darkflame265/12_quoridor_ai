import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess} from '../server/native-process.mjs';
import {nativeSourceHash} from '../evaluation/native-policy.mjs';
import {initial,apply,legal,moves} from '../src/engine.js';
import {solveEndgame} from '../src/search.js';
const source='reports/native52/holdout',report=JSON.parse(await readFile(path.join(source,'report.json'))),positions=[],seen=new Set();
for(const game of report.games){const replay=JSON.parse(await readFile(path.join(source,game.file)));let state=initial();for(const [ply,action] of replay.records.entries()){
 if(state.left[0]+state.left[1]===1&&state.left[state.turn]===1&&!moves(state).some(a=>a.y===(state.turn===0?0:8))){const key=JSON.stringify([state.p,state.turn,state.walls.map(w=>[w.x,w.y,w.o]).sort()]);if(!seen.has(key)){seen.add(key);positions.push({id:`${game.id}-ply${ply}`,state:structuredClone(state),records:replay.records.slice(0,ply)});}}
 if(!legal(state,action))throw Error('Invalid source replay');state=apply(state,action);
}}
const baseline=new NativeProcess({profile:'baseline'}),candidate=new NativeProcess({profile:'candidate'}),results=[];
function ending(state,action){const next=apply(state,action);if(next.winner!==null)return next.winner===state.turn?1:-1;if(next.left[0]+next.left[1]>0)return null;return -solveEndgame(next).lookup(next.p[0].y*9+next.p[0].x,next.p[1].y*9+next.p[1].x,next.turn).outcome;}
try{await baseline.health();await candidate.health();for(const fixture of positions.slice(0,12)){const old=await baseline.search(fixture.state,{ms:500,cores:4,maxDepth:1}),fresh=await candidate.search(fixture.state,{ms:500,cores:4,maxDepth:1});if(!legal(fixture.state,old.pv[0])||!legal(fixture.state,fresh.pv[0]))throw Error('Illegal reviewed move');results.push({...fixture,baseline:{action:old.pv[0],score:old.score,endingOutcome:ending(fixture.state,old.pv[0])},candidate:{action:fresh.pv[0],score:fresh.score,endingOutcome:ending(fixture.state,fresh.pv[0]),endgameSolves:fresh.endgameSolves,endgameHits:fresh.endgameHits}});}}
finally{baseline.close();candidate.close();}
await mkdir('reports/native53',{recursive:true});const output={source,sourceHash:nativeSourceHash(),ms:500,cores:4,maxDepth:1,available:positions.length,analyzed:results.length,warning:'Previously used development positions and depth-one diagnosis; not a win-rate benchmark. A null outcome means the action does not enter a wall-free ending.',results};await writeFile('reports/native53/last-wall-review.json',JSON.stringify(output,null,2));console.log(JSON.stringify({available:positions.length,analyzed:results.length,candidateProvenWins:results.filter(r=>r.candidate.endingOutcome===1).length,baselineProvenWins:results.filter(r=>r.baseline.endingOutcome===1).length,oracleSolves:results.reduce((n,r)=>n+r.candidate.endgameSolves,0)}));
