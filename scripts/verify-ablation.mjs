import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const directory=process.argv[2];if(!directory)throw Error('Specify the ablation directory');
const bytes=await readFile(path.join(directory,'report.json')),report=JSON.parse(bytes);
if(report.status!=='completed'||report.benchmarks.length!==3||report.arenas.length!==4||JSON.stringify(report.identity)!==JSON.stringify(verifyMazeBuild()))throw Error('Incomplete or changed ablation');
for(const [f,h] of Object.entries(report.sources))if(digest(await readFile(f))!==h)throw Error('Ablation source changed');
for(const input of report.inputs)if(digest(await readFile(input.file))!==input.sha256)throw Error('Ablation replay input changed');
const benchmarkExe=path.join('experimental-engine/target/release',process.platform==='win32'?'eval-benchmark.exe':'eval-benchmark');
if(digest(await readFile(benchmarkExe))!==report.benchmarkBinaryHash)throw Error('Evaluation benchmark changed');
for(const rows of report.benchmarks){
 const get=mode=>rows.find(r=>r.mode===mode);
 if(rows.length!==6||new Set(rows.map(r=>r.mode)).size!==6||rows.some(r=>r.positions!==report.positions||r.scores.length!==report.positions||r.rounds!==50||r.checksum!==r.scores.reduce((n,s)=>n+s,0)*r.rounds||r.warmMicros<=0))throw Error('Invalid microbenchmark');
 if(JSON.stringify(get('baseline').scores)!==JSON.stringify(get('cache4').scores)||JSON.stringify(get('reference8').scores)!==JSON.stringify(get('combined8').scores))throw Error('Score equivalence failed');
}
let games=0;
for(const entry of report.arenas){
 const file=path.resolve(directory,entry.file);if(!file.startsWith(path.resolve(directory)+path.sep))throw Error('Arena outside ablation');
 const data=await readFile(file),arena=JSON.parse(data);if(digest(data)!==entry.sha256||arena.mode!==entry.mode||!report.config.modes.includes(arena.mode)||arena.ms!==report.config.ms||arena.cores!==4||arena.maxPlies!==report.config.maxPlies||arena.pairs!==report.config.pairs||JSON.stringify(arena.identity)!==JSON.stringify(report.identity)||JSON.stringify(arena.summary)!==JSON.stringify(entry.summary)||JSON.stringify(arena.timing)!==JSON.stringify(entry.timing))throw Error('Ablation arena binding mismatch');
 const result=spawnSync(process.execPath,['scripts/verify-maze.mjs',path.dirname(file)],{encoding:'utf-8',windowsHide:true});if(result.status!==0)throw Error(result.stderr||'Arena revalidation failed');games+=arena.games.length;
}
if(new Set(report.arenas.map(a=>a.mode)).size!==4)throw Error('Duplicate mode');
const median=xs=>[...xs].sort((a,b)=>a-b)[1],times=Object.fromEntries(report.benchmarks[0].map(r=>[r.mode,median(report.benchmarks.map(rows=>rows.find(x=>x.mode===r.mode).warmMicros))]));
const result={reportSha256:digest(bytes),verifiedPositions:report.positions,verifiedGames:games,scoreIdenticalCache4:true,scoreIdenticalCombined8:true,medianWarmMicros:times,cache4WarmReduction:1-times.cache4/times.baseline,combined8VersusReferenceWarmRatio:times.combined8/times.reference8,productionActive:false};
await writeFile(path.join(directory,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
