import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {initial,apply,legal} from '../src/engine.js';
import {pressureMetrics} from '../src/pressure-advice.js';
import {verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {digest,nativeSourceHash,activeNativeProfile} from '../evaluation/native-policy.mjs';
const folder=process.argv[2]??'reports/immediate-pressure/development',bytes=await readFile(path.join(folder,'report.json')),report=JSON.parse(bytes),identity=verifyPressureBuild();
assert.equal(report.status,'completed');assert.deepEqual(report.identity,identity);assert.equal(report.nativeSourceHash,nativeSourceHash());assert.equal(activeNativeProfile(),'candidate');assert.equal(report.games.length,report.pairsPerSuite*4);
const metrics={candidate:{walls:0,nearWalls:0,negativeImmediateNet:0,totalDelay:0},stable:{walls:0,nearWalls:0,negativeImmediateNet:0,totalDelay:0}},timing={candidate:{moves:0,elapsedMs:0,overruns:0},stable:{moves:0,elapsedMs:0,overruns:0}},files=[];let actions=0;
for(const suite of ['general','maze'])for(let i=0;i<report.pairsPerSuite;i++)for(const side of [0,1])assert.equal(report.games.filter(g=>g.suite===suite&&g.openingIndex===i&&g.candidateSide===side).length,1);
for(const entry of report.games){const file=path.join(folder,entry.file),data=await readFile(file),game=JSON.parse(data),prefix=game.records.length-game.trace.length;let s=initial();
 for(const a of game.records.slice(0,prefix)){assert.ok(legal(s,a));s=apply(s,a);actions++;}
 for(const [i,row]of game.trace.entries()){assert.equal(row.turn,s.turn);assert.equal(row.role,s.turn===game.candidateSide?'candidate':'stable');assert.deepEqual(row.action,game.records[prefix+i]);assert.ok(legal(s,row.action));const p=pressureMetrics(s,row.action);assert.deepEqual(row.pressure,p);
  if(row.action.type==='wall'){const m=metrics[row.role];m.walls++;m.totalDelay+=p.enemyDelay;if(p.firstContact!==null&&p.firstContact<3)m.nearWalls++;if(p.netGain<0)m.negativeImmediateNet++;}
  const t=timing[row.role];t.moves++;t.elapsedMs+=row.elapsedMs;if(row.elapsedMs>report.ms*1.2+5)t.overruns++;s=apply(s,row.action);actions++;
 }assert.equal(s.winner,game.winner);assert.equal(entry.result,s.winner===null?'draw':s.winner===game.candidateSide?'win':'loss');files.push({file,sha256:digest(data)});
}assert.deepEqual(metrics,report.metrics);assert.deepEqual(timing,report.timing);const counts={wins:report.games.filter(g=>g.result==='win').length,losses:report.games.filter(g=>g.result==='loss').length,draws:report.games.filter(g=>g.result==='draw').length};for(const k of Object.keys(counts))assert.equal(report.summary[k],counts[k]);
const result={status:'verified',reportSha256:digest(bytes),identity,files,actions,metrics,summary:report.summary,defaultProfile:activeNativeProfile(),productionPromoted:false,caveat:'Small development sample; no independent holdout and no claim of increased playing strength.'};await writeFile(path.join(folder,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,games:files.length,actions,summary:result.summary,metrics}));
