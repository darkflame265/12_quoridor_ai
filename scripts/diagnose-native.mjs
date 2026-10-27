import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {activeNativeProfile,nativeSourceHash,nativeSources,digest} from '../evaluation/native-policy.mjs';
import {initial,apply,legal} from '../src/engine.js';
import {reconstructLoss,sampleLosses,exactOutcome,geometry,classify,actionKey,positionKey} from '../evaluation/native-diagnostics.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const args=process.argv.slice(2),get=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const source=get('--source','reports/native53/validation/report.json'),out=get('--out','reports/native-diagnostics/v1'),limit=Number(get('--positions',12)),shortMs=Number(get('--short-ms',500)),longMs=Number(get('--long-ms',3000)),branchMs=Number(get('--branch-ms',1500)),cores=Number(get('--cores',4)),verify=args.includes('--verify'),resume=args.includes('--resume');
if(!Number.isInteger(limit)||limit<1||limit>100||![shortMs,longMs,branchMs].every(n=>Number.isInteger(n)&&n>=1&&n<=30000)||longMs<=shortMs||!Number.isInteger(cores)||cores<1||cores>4)throw Error('Invalid diagnostic budget');
if(activeNativeProfile()!=='candidate')throw Error('Approved Atlas 5.3 is unavailable');
const manifest=JSON.parse(await readFile('native-engine/target/release/source-manifest.json'));
for(const f of nativeSources)if(manifest.sources[f]!==digest(await readFile(f)))throw Error('Rebuild the native engine first');
const files=['scripts/diagnose-native.mjs','evaluation/native-diagnostics.mjs','evaluation/native-policy.mjs','server/native-process.mjs','src/engine.js','src/search.js'];
const sources=Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(f))]))),identity={sourceHash:nativeSourceHash(),binaryHash:digest(await readFile(nativeExecutable)),releaseHash:digest(await readFile('evaluation/native-release.json')),sources};
const sourceBytes=await readFile(source),archive=JSON.parse(sourceBytes);
if(archive.status!=='completed'||archive.split!=='validation')throw Error('Use a completed development-exposed validation archive; never a reserved holdout');
const inputs={file:source,sha256:digest(sourceBytes),games:[]};let candidates=[];
for(const entry of archive.games.filter(g=>g.result==='loss')){
 const file=path.join(path.dirname(source),entry.file),bytes=await readFile(file),game=JSON.parse(bytes);inputs.games.push({file,sha256:digest(bytes)});
 candidates.push(...reconstructLoss(game,{file,suite:entry.suite,id:entry.id}));
}
const selected=sampleLosses(candidates,limit),config={shortMs,longMs,branchMs,cores,limit},reportFile=path.join(out,'report.json');
async function save(value){await writeFile(reportFile,JSON.stringify(value,null,2)+'\n');}
async function unchanged(){if(nativeSourceHash()!==identity.sourceHash||digest(await readFile(nativeExecutable))!==identity.binaryHash||digest(await readFile('evaluation/native-release.json'))!==identity.releaseHash)throw Error('Native inputs changed');for(const [f,h] of Object.entries(sources))if(digest(await readFile(f))!==h)throw Error('Diagnostic sources changed');}
async function verifyReport(report){
 if(report.status!=='completed'||JSON.stringify(report.identity)!==JSON.stringify(identity)||JSON.stringify(report.inputs)!==JSON.stringify(inputs)||report.positions.length!==selected.length)throw Error('Incomplete or changed diagnostic inputs');
 for(const [i,item] of report.positions.entries()){
  if(positionKey(item.state)!==positionKey(selected[i].state)||JSON.stringify(item.records)!==JSON.stringify(selected[i].records)||JSON.stringify(item.diagnosis)!==JSON.stringify(classify(item)))throw Error('Diagnostic case mismatch');
  let state=initial();for(const a of item.records){if(!legal(state,a))throw Error('Illegal prefix');state=apply(state,a);}if(positionKey(state)!==positionKey(item.state))throw Error('Prefix state mismatch');
  for(const result of [item.short,item.repeat,item.long]){let s=state;for(const a of result.pv){if(!legal(s,a))throw Error('Illegal diagnostic PV');s=apply(s,a);}}
  const oracle=exactOutcome(state);if(JSON.stringify(oracle)!==JSON.stringify(item.exactRoot))throw Error('Exact root mismatch');
  for(const [r,b] of [[item.short,item.shortBranch],[item.long,item.longBranch]]){const child=apply(state,r.pv[0]),q=exactOutcome(child);if(b.exactOutcome!==(q===null?null:-q.outcome))throw Error('Exact branch mismatch');}
  const file=path.join(out,item.replay.file);if(digest(await readFile(file))!==item.replay.sha256)throw Error('Replay artifact changed');
 }
 await unchanged();return {verifiedPositions:report.positions.length,provenEndingLosses:report.positions.filter(p=>p.diagnosis.exactLoss).length};
}
if(verify){console.log(JSON.stringify(await verifyReport(JSON.parse(await readFile(reportFile))),null,2));}
else{
 let report;
 try{report=JSON.parse(await readFile(reportFile));if(!resume)throw Error('Use a fresh output directory or --resume');if(JSON.stringify(report.identity)!==JSON.stringify(identity)||JSON.stringify(report.inputs)!==JSON.stringify(inputs)||JSON.stringify(report.config)!==JSON.stringify(config))throw Error('Resume inputs changed');if(report.status==='completed'){console.log(JSON.stringify(await verifyReport(report)));process.exit(0);}}
 catch(e){if(e.code!=='ENOENT')throw e;report={format:'atlas-native-diagnostics-v1',status:'running',identity,inputs,config,exposedDevelopment:true,candidatePositions:candidates.length,positions:[],warning:'Archived losses and all resulting fixtures are development data. No strength improvement or engine promotion is claimed.'};}
 await mkdir(path.join(out,'cases'),{recursive:true});report.status='running';await save(report);
 async function search(state,ms){const engine=new NativeProcess({profile:'candidate'});try{await engine.health();const start=performance.now(),r=await engine.search(state,{ms,cores});if(!r.pv?.length||!legal(state,r.pv[0]))throw Error('Illegal engine output');return {...r,wallTimeMs:performance.now()-start,requestedMs:ms,coldProcess:true};}finally{engine.close();}}
 async function branch(state,a){const child=apply(state,a),q=exactOutcome(child);if(q!==null)return {score:-q.outcome*(30000-q.distance-1),exactOutcome:-q.outcome,reference:'independent JS retrograde'};const r=await search(child,branchMs);return {score:-r.score,exactOutcome:null,reference:'Native child search; root-player sign',search:r};}
 try{
  for(let i=report.positions.length;i<selected.length;i++){
   const item={id:`loss-${i}`,...selected[i]};item.short=await search(item.state,shortMs);item.repeat=await search(item.state,shortMs);item.long=await search(item.state,longMs);item.exactRoot=exactOutcome(item.state);
   item.shortBranch=await branch(item.state,item.short.pv[0]);item.longBranch=actionKey(item.short.pv[0])===actionKey(item.long.pv[0])?item.shortBranch:await branch(item.state,item.long.pv[0]);
   item.geometry={short:geometry(item.state,item.short.pv[0]),long:geometry(item.state,item.long.pv[0])};item.diagnosis=classify(item);
   const file=`cases/${item.id}.json`,bytes=JSON.stringify({version:1,records:[...item.records,item.short.pv[0]],diagnosticId:item.id,warning:'Development replay ending immediately after the short-budget decision.'},null,2)+'\n';await writeFile(path.join(out,file),bytes);item.replay={file,sha256:digest(bytes)};
   report.positions.push(item);await save(report);console.log(`${item.id}: ${item.suite}, ${item.diagnosis.review}, gap=${item.diagnosis.heuristicGap}, stable=${item.diagnosis.shortStable}`);
  }
  await unchanged();report.status='completed';report.summary={positions:report.positions.length,actionChanges:report.positions.filter(p=>p.diagnosis.actionChanged).length,unstableShortSearches:report.positions.filter(p=>!p.diagnosis.shortStable).length,searchSensitiveGaps:report.positions.filter(p=>p.diagnosis.review==='search-sensitive-gap').length,provenEndingLosses:report.positions.filter(p=>p.diagnosis.exactLoss).length,exactRoots:report.positions.filter(p=>p.exactRoot!==null).length};await save(report);console.log(JSON.stringify(await verifyReport(report)));
 }catch(error){report.status='interrupted';report.error=error.message;await save(report);throw error;}
}
