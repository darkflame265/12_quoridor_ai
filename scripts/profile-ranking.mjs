import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';
import {initial} from '../src/engine.js';
const out=process.argv[2];if(!out)throw Error('Specify fresh report JSON');
const identity=verifyMazeBuild(),inputs=[];let states=[];
const archive=JSON.parse(await readFile('reports/native53/validation/report.json'));
for(const game of archive.games.filter(g=>g.result==='loss')) {
 const file=path.join('reports/native53/validation',game.file),bytes=await readFile(file);
 inputs.push({file,sha256:digest(bytes)});
 states.push(...reconstructLoss(JSON.parse(bytes),{file,suite:game.suite}).map(p=>p.state));
}
// Include the initial position and dense fixtures beyond archived losses.
const fixtures=JSON.parse(await readFile('evaluation/fixtures/native54-search-review.json'));
states.push(initial());
states.push(...fixtures.cases.map(f=>f.state));
inputs.push({file:'evaluation/fixtures/native54-search-review.json',sha256:digest(await readFile('evaluation/fixtures/native54-search-review.json'))});
const exe='experimental-engine/target/release/eval-benchmark'+(process.platform==='win32'?'.exe':'');
const results=[];
for(const geometry of ['legacy','rank-only','eval-only','rank-eval','physical']) {
 const r=spawnSync(exe,['--ranking'],{input:JSON.stringify(states),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,
  env:{...process.env,QUORIDOR_MAZE_GEOMETRY:geometry,QUORIDOR_MAZE_ORDER_WEIGHT:'180',QUORIDOR_MAZE_THREAT_WEIGHT:'30'}});
 if(r.status!==0)throw Error(r.stderr||'Ranking verification failed');
 const data=JSON.parse(r.stdout),median=a=>a.sort((a,b)=>a-b)[Math.floor(a.length/2)];
 const referenceMicros=median(data.samples.map(s=>s.reference.micros)),optimizedMicros=median(data.samples.map(s=>s.optimized.micros));
 results.push({geometry,...data,referenceMicros,optimizedMicros,speedup:referenceMicros/optimizedMicros});
}
const report={format:'atlas-ranking-performance-v1',identity,inputs,sourceSha256:digest(await readFile('scripts/profile-ranking.mjs')),benchmarkSha256:digest(await readFile(exe)),results,productionActive:false,scope:'Cold move ordering with fresh search caches; not full-game strength'};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(results.map(({geometry,positions,rankedActionsChecked,wallDistanceChecks,bfsSkipped,speedup})=>({geometry,positions,rankedActionsChecked,wallDistanceChecks,bfsSkipped,speedup})),null,2));
