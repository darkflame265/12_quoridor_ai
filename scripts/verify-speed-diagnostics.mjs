import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';import {verifySpeedBuild} from '../evaluation/speed-policy.mjs';
import {initial,legal,apply} from '../src/engine.js';import {positionKey} from '../evaluation/native-diagnostics.mjs';
import {diagnoseSpeedCase} from '../evaluation/speed-diagnosis.mjs';
const directory=process.argv[2];if(!directory)throw Error('Specify diagnostic directory');
const file=path.join(directory,'report.json'),bytes=await readFile(file),r=JSON.parse(bytes);
if(r.status!=='completed'||r.positions.length!==r.config.sample||JSON.stringify(r.identity.speed)!==JSON.stringify(verifySpeedBuild()))throw Error('Incomplete or changed diagnostic');
const manifest=JSON.parse(await readFile('diagnostic-engine/target/release/source-manifest.json'));
for(const [f,h] of Object.entries(manifest.sources))if(r.identity.sources[f]!==h)throw Error('Rebuild diagnostic engine: source manifest mismatch');
if(manifest.diagnosticBinary!==r.identity.diagnosticBinary||manifest.auditBinary!==r.identity.auditBinary)throw Error('Rebuild diagnostic engine: binary manifest mismatch');
for(const [f,h] of Object.entries(r.identity.sources))if(digest(await readFile(f))!==h)throw Error('Diagnostic source changed');
for(const input of r.inputs)if(digest(await readFile(input.file))!==input.sha256)throw Error('Archived input changed');
for(const [f,h] of [['diagnostic-engine/target/release/quoridor-diagnostic'+(process.platform==='win32'?'.exe':''),r.identity.diagnosticBinary],['diagnostic-engine/target/release/audit'+(process.platform==='win32'?'.exe':''),r.identity.auditBinary]])if(digest(await readFile(f))!==h)throw Error('Diagnostic binary changed');
const fixtures=[];await mkdir(path.join(directory,'cases'),{recursive:true});
for(const item of r.positions){
 let state=initial();for(const a of item.records){if(!legal(state,a))throw Error('Illegal archived prefix');state=apply(state,a);}
 if(positionKey(state)!==positionKey(item.state)||JSON.stringify(item.diagnosis)!==JSON.stringify(diagnoseSpeedCase(item)))throw Error('Case changed');
 for(const result of Object.values(item.searches)){let s=state;for(const a of result.pv){if(!legal(s,a))throw Error('Illegal PV');s=apply(s,a);}}
 if(item.threats.some(t=>t.full!==t.independentGain))throw Error('Threat oracle disagreement');
 const replay={version:2,records:item.records,mode:'sandbox',side:state.turn,startPosition:'top',time:'500',cores:'4',engine:'atlas5',diagnosticId:item.id};
 const filename=`cases/${item.id}.json`,data=JSON.stringify(replay,null,2)+'\n';await writeFile(path.join(directory,filename),data);fixtures.push({id:item.id,file:filename,sha256:digest(data),diagnosis:item.diagnosis});
}
const result={verifiedPositions:r.positions.length,reportSha256:digest(bytes),verifierSha256:digest(await readFile('scripts/verify-speed-diagnostics.mjs')),fixtures,productionActive:false};
await writeFile(path.join(directory,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({verifiedPositions:r.positions.length}));
