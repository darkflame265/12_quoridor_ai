import {readFile,mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {initial,apply,legal,notation} from '../src/engine.js';
import {wallStreak} from '../src/wall-streak.js';
const args=process.argv.slice(2),source=args[0]??'reports/connection-budget/diagnostics.json';
const data=JSON.parse(await readFile(source,'utf8'));let fixtures=[];
if(Array.isArray(data.rows))fixtures=data.rows.map(r=>({ply:r.ply,state:r.state}));
else{
 let state=data.baseState??initial();const records=[];
 for(const [i,a] of data.records.entries()){
  if(!legal(state,a))throw Error(`Invalid recorded action at ${i+1}`);
  if(state.turn===Number(data.side??0)&&state.left[1-state.turn]>=2&&(state.left[state.turn]<=3||i%8===0))fixtures.push({ply:i+1,state:{...state,wallStreak:wallStreak(records,state.turn,data.baseState?.turn??0)}});
  records.push(a);state=apply(state,a);
 }
}
// Spread replay samples over the whole game so early wall spending does not
// crowd out the final approach. Explicit fixture lists keep their order.
if(fixtures.length>8)fixtures=Array.isArray(data.rows)?fixtures.slice(0,8):Array.from({length:8},(_,i)=>fixtures[Math.floor(i*(fixtures.length-1)/7)]);
const env={QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'};
const engine=new NativeProcess({executable:pressureExecutable,profile:'candidate',env}),rows=[];
const median=values=>values.slice().sort((a,b)=>a-b)[Math.floor(values.length/2)];
try{
 await engine.health();
 for(const fixture of fixtures){
  const scopes={};
  for(const [label,options] of Object.entries({normal:{},attacks:{attacksWide:true},defenses:{defensesWide:true},both:{wide:true},uncached:{cache:false}})){
   const runs=[];
   for(let i=0;i<3;i++){const r=await engine.request({op:'connection',state:fixture.state,ms:1000,...options},{timeoutMs:2000});runs.push(r.diagnostics);}
   scopes[label]={complete:runs.every(r=>r.complete),estimates:runs.map(r=>r.estimate),medianMs:median(runs.map(r=>r.elapsedMs)),medianBuilds:median(runs.map(r=>r.geometryBuilds)),medianHits:median(runs.map(r=>r.geometryHits))};
  }
  const r=await engine.search(fixture.state,{ms:500,cores:4});
  const rootRuns={};for(const cache of [false,true]){
   const runs=[];for(let i=0;i<3;i++){const value=await engine.request({op:'connection',state:fixture.state,ms:1000,root:true,cache},{timeoutMs:2000});runs.push(value.diagnostics);}
   rootRuns[cache?'cached':'uncached']={complete:runs.every(r=>r.complete),medianMs:median(runs.map(r=>r.elapsedMs)),estimate:runs[0].estimate,adjustments:runs[0].adjustments,geometryBuilds:median(runs.map(r=>r.geometryBuilds)),geometryHits:median(runs.map(r=>r.geometryHits))};
  }
  const n=scopes.normal,a=scopes.attacks,d=scopes.defenses;
  const row={...fixture,scopes,rootRuns,attackSensitive:n.complete&&a.complete&&a.estimates[0]>n.estimates[0],defenseSensitive:n.complete&&d.complete&&d.estimates[0]<n.estimates[0],cacheEquivalent:n.complete&&scopes.uncached.complete&&n.estimates.every((v,i)=>v===scopes.uncached.estimates[i])&&rootRuns.cached.complete&&rootRuns.uncached.complete&&rootRuns.cached.estimate===rootRuns.uncached.estimate&&JSON.stringify(rootRuns.cached.adjustments)===JSON.stringify(rootRuns.uncached.adjustments),recommendation:notation(r.pv[0]),legal:legal(fixture.state,r.pv[0]),depth:r.depth,risk:r.connectionRisk};
  rows.push(row);console.log(JSON.stringify({...row,state:undefined}));
 }
}finally{engine.close();}
const out='reports/connection-audit';await mkdir(out,{recursive:true});
await writeFile(path.join(out,'audit.json'),JSON.stringify({source,build:verifyPressureBuild().binaryHash.slice(0,12),warning:'Selective scope sensitivity and local timings; not proof of risk or strength.',rows},null,2));
if(rows.some(r=>!r.cacheEquivalent||!r.legal))throw Error('Audit found a cache mismatch, incomplete equivalence check, or illegal recommendation; inspect audit.json.');
