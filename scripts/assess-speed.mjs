import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {verifySpeedBuild} from '../evaluation/speed-policy.mjs';
import {assessSpeed} from '../evaluation/speed-release-policy.mjs';
const [vdir,hdir,bfile,out]=process.argv.slice(2);if(!out)throw Error('Specify validation-dir holdout-dir-or-none benchmark.json output.json');
const inputs=[];
async function read(file){const bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});return JSON.parse(bytes);}
const v=await read(path.join(vdir,'report.json')),h=hdir==='none'?null:await read(path.join(hdir,'report.json')),b=await read(bfile),identity=verifySpeedBuild();
for(const report of [v,h,b].filter(Boolean))if(JSON.stringify(report.identity)!==JSON.stringify(identity))throw Error('Candidate changed');
if(b.scriptSha256!==digest(await readFile('scripts/benchmark-speed.mjs')))throw Error('Benchmark code changed');
for(const dir of [vdir,...(h?[hdir]:[])]){
 const r=spawnSync(process.execPath,['scripts/verify-speed.mjs',dir,'--save'],{encoding:'utf8',windowsHide:true});if(r.status!==0)throw Error(r.stderr||'Replay verification failed');
}
const bySuite=Object.fromEntries(['general','maze'].map(s=>[s,Object.fromEntries(['win','loss','draw'].map(result=>[result,v.games.filter(g=>g.suite===s&&g.result===result).length]))]));
const validationChecks={completed:v.status==='completed',samples:v.games.length>=100,positive:v.summary.win>v.summary.loss,suites:Object.values(bySuite).every(s=>s.win>=s.loss),tactics:v.tactics.length===16&&v.tactics.every(t=>t.pass),deadline:v.timing.candidate.overruns/v.timing.candidate.moves<.05};
const assessment=assessSpeed(v,h,b),receipt={format:'atlas-speed-decision-v1',identity,inputs,policySha256:digest(await readFile('evaluation/speed-release-policy.mjs')),...assessment,validationChecks,bySuite,holdoutSkipped:!h,productionActive:false};
await writeFile(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(assessment,null,2));
