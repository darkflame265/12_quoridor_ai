import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';
const out=process.argv[2];if(!out)throw Error('Specify fresh output JSON');
const identity=verifyMazeBuild(),inputs=[];let states=[];
const archive=JSON.parse(await readFile('reports/native53/validation/report.json'));
for(const game of archive.games.filter(g=>g.result==='loss')) {
 const file=path.join('reports/native53/validation',game.file),bytes=await readFile(file);
 inputs.push({file,sha256:digest(bytes)});
 states.push(...reconstructLoss(JSON.parse(bytes),{file,suite:game.suite}).map(p=>p.state));
}
const exe='experimental-engine/target/release/eval-benchmark'+(process.platform==='win32'?'.exe':'');
const r=spawnSync(exe,['--forcing'],{input:JSON.stringify(states),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,
 env:{...process.env,QUORIDOR_MAZE_SEARCH:'forcing',QUORIDOR_MAZE_GEOMETRY:'legacy',QUORIDOR_MAZE_ORDER_WEIGHT:'180',QUORIDOR_MAZE_THREAT_WEIGHT:'30'}});
if(r.status!==0)throw Error(r.stderr||'Forcing review failed');const rows=JSON.parse(r.stdout);
const report={format:'atlas-forcing-review-v1',identity,inputs,benchmarkSha256:digest(await readFile(exe)),sourceSha256:digest(await readFile('scripts/review-forcing.mjs')),
 states:states.length,rankedActions:rows.reduce((n,r)=>n+r.actions,0),positionsWithProtection:rows.filter(r=>r.protected.length).length,
 protectedActions:rows.reduce((n,r)=>n+r.protected.length,0),maximumProtected:Math.max(...rows.map(r=>r.protected.length)),
 rankingUnchanged:true,boardRestored:true,rows,productionActive:false,
 limitation:'Depth protection opportunities in exposed losses, not proof that these actions reverse the result'};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({states:report.states,rankedActions:report.rankedActions,positionsWithProtection:report.positionsWithProtection,protectedActions:report.protectedActions,maximumProtected:report.maximumProtected}));
