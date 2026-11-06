import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {legal,apply} from '../src/engine.js';
import {positionKey,observationOutcome} from '../src/spectator.js';
import {runtimeFingerprint} from './runtime-identity.mjs';
const dir='reports/engine-comparison-20261106',report=JSON.parse(await readFile(dir+'/results.json','utf8'));
assert.equal(await runtimeFingerprint(process.cwd()),report.config.fingerprint,'Current code differs from frozen run');
const identities=new Set(),metrics=Object.fromEntries(['sigma2','sigma3','sigma4'].map(id=>[id,{wins:0,losses:0,repetitionDraws:0,moves:0,elapsed:[],simulations:[],over500ms:0,over550ms:0,illegal:0}]));
for(const game of report.games){
 assert(!identities.has(game.id));identities.add(game.id);
 const fixture=report.fixtures.find(f=>f.id===game.fixture);assert(fixture);
 assert.deepEqual(game.sides,game.swap?[game.b,game.a]:[game.a,game.b]);
 let state=fixture.state;const history=[...fixture.history];
 for(const step of game.trace){
  assert.equal(step.side,state.turn);assert.equal(step.engine,game.sides[state.turn]);assert(legal(state,step.action),game.id);
  assert(Number.isFinite(step.wallMs)&&step.wallMs>=0);assert(Number.isInteger(step.simulations)&&step.simulations>=0&&step.simulations<=200);
  const m=metrics[step.engine];m.moves++;m.elapsed.push(step.wallMs);m.simulations.push(step.simulations);if(step.wallMs>500)m.over500ms++;if(step.wallMs>550)m.over550ms++;
  history.push(state);state=apply(state,step.action);
 }
 assert.equal(positionKey(state),positionKey(game.finalState));assert.equal(state.winner,game.finalState.winner);
 assert.equal(createHash('sha256').update(JSON.stringify(game.trace.map(t=>t.action))).digest('hex'),game.moveHash);
 if(game.reason==='goal'){
  assert.notEqual(state.winner,null);assert.equal(game.winner,game.sides[state.winner]);
  metrics[game.winner].wins++;metrics[game.sides[1-state.winner]].losses++;
 }else if(game.reason==='repetition'){
  assert.equal(game.winner,null);assert.equal(observationOutcome(state,history,{maxPlies:10000}).reason,'repetition');
  for(const id of game.sides)metrics[id].repetitionDraws++;
 }else assert(['error','ply-cap'].includes(game.reason));
}
if(report.finishedAt){
 const expected=report.config.pilot.length*3*2+report.config.followup.length*report.followupPairs.length*2;
 assert.equal(report.games.length,expected,'Missing or excess games');
 for(const p of report.summary){
  const games=report.games.filter(g=>g.a===p.a&&g.b===p.b);
  assert.equal(p.games,games.length);assert.equal(p.winsA,games.filter(g=>g.winner===p.a).length);assert.equal(p.winsB,games.filter(g=>g.winner===p.b).length);
  assert.equal(p.draws,games.filter(g=>g.reason==='repetition').length);
  for(const source of p.sourceGroups){const rows=games.filter(g=>g.fixture===source.fixture&&(g.reason==='goal'||g.reason==='repetition'));assert.equal(rows.length,source.n);if(source.scoreA!==null)assert.equal(source.scoreA,rows.reduce((n,g)=>n+(g.winner===p.a?1:g.winner===p.b?0:.5),0)/2);}
 }
}
for(const m of Object.values(metrics)){
 m.elapsed.sort((a,b)=>a-b);m.simulations.sort((a,b)=>a-b);
 m.meanMs=m.elapsed.length?m.elapsed.reduce((a,b)=>a+b,0)/m.elapsed.length:null;
 m.p95Ms=m.elapsed[Math.max(0,Math.ceil(m.elapsed.length*.95)-1)]??null;
 m.meanSimulations=m.simulations.length?m.simulations.reduce((a,b)=>a+b,0)/m.simulations.length:null;
 delete m.elapsed;delete m.simulations;
}
const audit={partial:!report.finishedAt,checkedGames:report.games.length,uniqueGameKeys:identities.size,fullReplayAndWinnersValid:true,currentCodeMatchesFrozenRun:true,metrics,decision:report.decision??null};
await writeFile(dir+'/audit.json',JSON.stringify(audit,null,2));console.log(JSON.stringify(audit));
