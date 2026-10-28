import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';import {verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';import {selectRootCandidate} from '../evaluation/root-guard-decision.mjs';import {digest} from '../evaluation/native-policy.mjs';
const [rootDir,tacticalDir,pfile,out]=process.argv.slice(2);if(!out)throw Error('Specify root-dir tactical-dir proof.json fresh-output.json');
const inputs=[];async function read(file){const bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});return JSON.parse(bytes);}
const reports=[];for(const dir of [rootDir,tacticalDir])reports.push(await read(path.join(dir,'report.json')));const proof=await read(pfile),identity=verifyRootGuardBuild();
for(const r of [...reports,proof])if(JSON.stringify(r.identity)!==JSON.stringify(identity))throw Error('Candidate changed');
if(proof.scriptSha256!==digest(await readFile('scripts/check-root-guard.mjs'))||proof.source.sha256!==digest(await readFile(proof.source.file)))throw Error('Proof source changed');
if(reports[0].mode!=='root'||reports[1].mode!=='tactical')throw Error('Wrong mode order');
if(reports[0].pairs!==reports[1].pairs||reports[0].fixtureSeed!==reports[1].fixtureSeed)throw Error('Development samples differ');
for(const dir of [rootDir,tacticalDir]){const r=spawnSync(process.execPath,['scripts/verify-root-guard.mjs',dir,'--save'],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||'Replay verification failed');}
const selected=selectRootCandidate(reports,proof);await writeFile(out,JSON.stringify({format:'atlas-root-selection-v1',identity,inputs,policySha256:digest(await readFile('evaluation/root-guard-decision.mjs')),...selected},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(selected,null,2));
