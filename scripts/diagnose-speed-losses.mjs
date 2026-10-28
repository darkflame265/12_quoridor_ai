import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {speedExecutable,verifySpeedBuild} from '../evaluation/speed-policy.mjs';
import {nativeSources,digest} from '../evaluation/native-policy.mjs';
import {reconstructLoss,sampleLosses} from '../evaluation/native-diagnostics.mjs';
import {diagnoseSpeedCase} from '../evaluation/speed-diagnosis.mjs';
import {initial,legal,apply} from '../src/engine.js';import {Position} from '../src/search.js';
const out=process.argv[2];if(!out)throw Error('Specify fresh output directory');
const reportFile=path.join(out,'report.json');try{await readFile(reportFile);throw Error('Use a fresh output directory');}catch(e){if(e.code!=='ENOENT')throw e;}
const exe='diagnostic-engine/target/release/quoridor-diagnostic'+(process.platform==='win32'?'.exe':'');
const auditExe='diagnostic-engine/target/release/audit'+(process.platform==='win32'?'.exe':'');
const files=[...nativeSources,'speed-engine/src/ranking-paths.rs','diagnostic-engine/Cargo.toml','diagnostic-engine/Cargo.lock','diagnostic-engine/build.rs','diagnostic-engine/src/lib.rs','diagnostic-engine/src/main.rs','diagnostic-engine/src/bin/audit.rs','scripts/diagnose-speed-losses.mjs','evaluation/speed-diagnosis.mjs','evaluation/native-diagnostics.mjs','server/native-process.mjs','src/engine.js','src/search.js'];
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(f))])));
const identity={speed:verifySpeedBuild(),sources,diagnosticBinary:digest(await readFile(exe)),auditBinary:digest(await readFile(auditExe)),originalBinary:digest(await readFile(nativeExecutable))};
const source='reports/speed65/validation/report.json',sourceBytes=await readFile(source),archive=JSON.parse(sourceBytes),inputs=[{file:source,sha256:digest(sourceBytes)}];
if(archive.status!=='completed'||archive.split!=='validation')throw Error('Use completed exposed validation, never holdout');
let positions=[];
for(const g of archive.games.filter(g=>g.suite==='maze'&&g.result==='loss')){
 const file=path.join(path.dirname(source),g.file),bytes=await readFile(file);if(digest(bytes)!==g.sha256)throw Error('Replay changed');inputs.push({file,sha256:digest(bytes)});
 positions.push(...reconstructLoss(JSON.parse(bytes),{file,suite:'maze',id:g.id}));
}
positions=positions.filter(p=>p.state.left[0]+p.state.left[1]>1);
const selected=sampleLosses(positions,12);
const audit=spawnSync(auditExe,[],{input:JSON.stringify(selected.map(p=>p.state)),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});if(audit.status!==0)throw Error(audit.stderr);
const audits=JSON.parse(audit.stdout);
const report={format:'atlas-speed-diagnostics-v1',status:'running',identity,inputs,exposedDevelopment:true,candidatePositions:positions.length,
 config:{sample:12,fixedMs:15000,fixedDepths:[3,4],shortMs:500,longMs:3000},positions:[],productionActive:false};
await mkdir(out,{recursive:true});const save=()=>writeFile(reportFile,JSON.stringify(report,null,2)+'\n');await save();
function independent(state,target){const s=structuredClone(state);s.turn=1-target;if(!s.left[s.turn])return 0;const p=new Position(s),base=p.distances(target),other=p.distances(s.turn);let gain=0;
 for(const o of ['h','v'])for(let y=0;y<8;y++)for(let x=0;x<8;x++){const a={type:'wall',x,y,o};if(!legal(s,a))continue;const q=new Position(apply(s,a));gain=Math.max(gain,q.distances(target)-base-(q.distances(s.turn)-other)-1);}return gain;}
async function search(state,{full=false,cores=1,depth=3,ms=15000,speed=false}={}){
 const client=new NativeProcess({executable:speed?speedExecutable:exe,profile:'candidate',env:{QUORIDOR_DIAGNOSTIC_FULL_WIDTH:full?'1':'0'}});
 try{await client.health();const start=performance.now(),r=await client.search(state,{ms,cores,maxDepth:depth});let p=state;
  for(const a of r.pv){if(!legal(p,a))throw Error('Illegal diagnostic PV');p=apply(p,a);}if(!r.pv.length)throw Error('Missing diagnostic action');return {...r,requestedMs:ms,maxDepth:depth,requestedCores:cores,fullWidth:full,wallMs:performance.now()-start};
 }finally{client.close();}
}
try{
 for(const [i,p] of selected.entries()){
  const searches={};searches.speed3=await search(p.state,{speed:true});searches.selective3=await search(p.state);
  const a=searches.speed3,b=searches.selective3;
  if(a.depth!==b.depth||a.score!==b.score||a.nodes!==b.nodes||JSON.stringify(a.pv)!==JSON.stringify(b.pv))throw Error('Diagnostic disabled-LMR switch changed normal mode');
  searches.full3=await search(p.state,{full:true});searches.parallel3=await search(p.state,{cores:4});
  searches.selective4=await search(p.state,{depth:4});searches.full4=await search(p.state,{full:true,depth:4});
  searches.timed4=await search(p.state,{cores:4,depth:40,ms:500});searches.long4=await search(p.state,{cores:4,depth:40,ms:3000});
  const threats=audits[i].threats.map(t=>({...t,independentGain:independent(p.state,t.target)}));
  if(threats.some(t=>t.full!==t.independentGain))throw Error('Native threat disagrees with independent exhaustive wall check');
  const item={id:`maze-${i}`,...p,searches,staticScore:audits[i].score,threats};item.diagnosis=diagnoseSpeedCase(item);report.positions.push(item);await save();console.log(`${item.id}: d3=${item.diagnosis.selective3.scoreDiffers}, d4=${item.diagnosis.selective4.scoreDiffers}, cores=${item.diagnosis.cores3.scoreDiffers}, omissions=${item.diagnosis.threatOmissions}`);
 }
 for(const [f,h] of Object.entries(sources))if(digest(await readFile(f))!==h)throw Error('Diagnostic sources changed');
 if(digest(await readFile(exe))!==identity.diagnosticBinary||digest(await readFile(auditExe))!==identity.auditBinary||JSON.stringify(verifySpeedBuild())!==JSON.stringify(identity.speed))throw Error('Build changed');
 report.status='completed';report.summary={positions:report.positions.length,selective3ScoreDifferences:report.positions.filter(p=>p.diagnosis.selective3.scoreDiffers).length,selective4ScoreDifferences:report.positions.filter(p=>p.diagnosis.selective4.scoreDiffers).length,coreScoreDifferences:report.positions.filter(p=>p.diagnosis.cores3.scoreDiffers).length,timeActionChanges:report.positions.filter(p=>p.diagnosis.timeActionChanges).length,threatOmissions:report.positions.reduce((n,p)=>n+p.diagnosis.threatOmissions,0)};await save();console.log(JSON.stringify(report.summary));
}catch(error){report.status='interrupted';report.error=error.message;await save();throw error;}
