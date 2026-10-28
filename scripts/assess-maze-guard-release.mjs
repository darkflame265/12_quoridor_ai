import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {verifyMazeGuardBuild} from '../evaluation/maze-guard-policy.mjs';import {assessMazeGuardRelease} from '../evaluation/maze-guard-release-policy.mjs';import {digest} from '../evaluation/native-policy.mjs';
const [ddir,vdir,hdir,pfile,out]=process.argv.slice(2);if(!out)throw Error('Specify development-dir validation-dir holdout-dir-or-none proof.json fresh-output.json');
const inputs=[];async function read(file){const bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});return JSON.parse(bytes);}
const d=await read(path.join(ddir,'report.json')),v=await read(path.join(vdir,'report.json')),h=hdir==='none'?null:await read(path.join(hdir,'report.json')),p=await read(pfile),identity=verifyMazeGuardBuild();
for(const r of [d,v,h,p].filter(Boolean))if(JSON.stringify(r.identity)!==JSON.stringify(identity))throw Error('Candidate changed');
if(p.scriptSha256!==digest(await readFile('scripts/check-maze-guard.mjs'))||p.source.sha256!==digest(await readFile(p.source.file)))throw Error('Reference changed');
for(const dir of [ddir,vdir,...(h?[hdir]:[])]){const r=spawnSync(process.execPath,['scripts/verify-maze-guard.mjs',dir,'--save'],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||'Replay verification failed');}
const bySuite=Object.fromEntries(['general','maze'].map(s=>[s,Object.fromEntries(['win','loss','draw'].map(result=>[result,v.games.filter(g=>g.suite===s&&g.result===result).length]))]));
const validationChecks={completed:v.status==='completed',samples:v.games.length>=100,originalControl:v.baseline==='original',positive:v.summary.win>v.summary.loss,suites:Object.values(bySuite).every(s=>s.win>=s.loss),tactics:v.tactics.length===16&&v.tactics.every(t=>t.pass),deadline:v.timing.candidate.overruns/v.timing.candidate.moves<.05};
const result={format:'atlas-maze-guard-release-decision-v1',identity,inputs,policySha256:digest(await readFile('evaluation/maze-guard-release-policy.mjs')),...assessMazeGuardRelease(d,v,h,p),validationChecks,bySuite,holdoutSkipped:!h};
await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(result.checks,null,2));
