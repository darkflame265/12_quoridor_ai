import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assessMaze} from '../evaluation/maze-candidate-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const [validationDir,holdoutDir,out]=process.argv.slice(2);if(!validationDir||!holdoutDir||!out)throw Error('Specify validation directory, holdout directory, and a fresh decision file');
const reports=[];
for(const directory of [validationDir,holdoutDir]){
 const verification=spawnSync(process.execPath,['scripts/verify-maze.mjs',directory],{encoding:'utf-8',windowsHide:true});if(verification.status!==0)throw Error(verification.stderr||'Arena verification failed');
 const file=path.join(directory,'report.json'),bytes=await readFile(file);reports.push({file,sha256:digest(bytes),report:JSON.parse(bytes)});
}
const assessment=assessMaze(...reports.map(r=>r.report));
const receipt={format:'atlas-maze-paired-decision-v2',assessorSha256:digest(await readFile(fileURLToPath(import.meta.url))),reports:reports.map(({file,sha256})=>({file,sha256})),mode:reports[0].report.mode,searchMode:reports[0].report.searchMode,assessment,productionActive:false,note:'Eligibility receipt only. This command does not change the live engine.'};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(receipt,null,2));
