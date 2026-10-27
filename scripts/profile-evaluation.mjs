import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';

const [before,out]=process.argv.slice(2);
if(!before||!out)throw Error('Specify frozen before executable and fresh output JSON');
const after='experimental-engine/target/release/eval-benchmark'+(process.platform==='win32'?'.exe':'');
const identity=verifyMazeBuild(),inputs=[];let states=[];
const archive=JSON.parse(await readFile('reports/native53/validation/report.json'));
for(const game of archive.games.filter(g=>g.result==='loss')) {
 const file=path.join('reports/native53/validation',game.file),bytes=await readFile(file);
 inputs.push({file,sha256:digest(bytes)});
 states.push(...reconstructLoss(JSON.parse(bytes),{file,suite:game.suite}).map(p=>p.state));
}
const input=JSON.stringify(states);
function run(executable,geometry,threat) {
 const r=spawnSync(executable,[],{input,encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,
  env:{...process.env,QUORIDOR_MAZE_GEOMETRY:geometry,QUORIDOR_MAZE_ORDER_WEIGHT:'180',QUORIDOR_MAZE_THREAT_WEIGHT:String(threat)}});
 if(r.status!==0)throw Error(r.stderr||'Benchmark failed');return JSON.parse(r.stdout);
}
const checks=[],samples=[];
for(const geometry of ['legacy','rank-only','eval-only','rank-eval','physical'])for(const threat of [30,0]) {
 const a=run(before,geometry,threat),b=run(after,geometry,threat);
 for(let i=0;i<a.length;i++)if(a[i].mode!==b[i].mode||JSON.stringify(a[i].scores)!==JSON.stringify(b[i].scores)||a[i].checksum!==b[i].checksum)throw Error('Evaluation changed');
 checks.push({geometry,threat,before:a,after:b});
}
// Alternate order to reduce systematic temperature/order bias. Timings are
// measurements of these positions, not claims about full-search playing strength.
for(let repeat=0;repeat<5;repeat++) {
 const order=repeat%2?['after','before']:['before','after'],sample={repeat};
 for(const name of order)sample[name]=run(name==='before'?before:after,'legacy',30);
 samples.push(sample);
}
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const timing=samples[0].before.map((r,i)=> {
 const beforeMicros=median(samples.map(s=>s.before[i].warmMicros)),afterMicros=median(samples.map(s=>s.after[i].warmMicros));
 return {mode:r.mode,beforeMicros,afterMicros,speedup:beforeMicros/afterMicros};
});
const report={format:'atlas-evaluation-performance-v1',identity,inputs,positions:states.length,
 beforeBinarySha256:digest(await readFile(before)),afterBinarySha256:digest(await readFile(after)),
 sourceSha256:digest(await readFile('scripts/profile-evaluation.mjs')),scoreChecks:checks,samples,timing,
 productionActive:false,scope:'Isolated static evaluation; no full-search strength claim'};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({positions:states.length,configurations:checks.length,allScoresIdentical:true,timing},null,2));
