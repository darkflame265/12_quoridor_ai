import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {reconstructLoss,positionKey} from '../evaluation/native-diagnostics.mjs';
const root=fileURLToPath(new URL('../',import.meta.url));process.chdir(root);
const args=process.argv.slice(2),get=(k,d)=>{const i=args.indexOf(k);return i<0?d:args[i+1];};
const out=get('--out','reports/maze-ablation/v2'),pairs=Number(get('--pairs',1)),ms=Number(get('--ms',500)),resume=args.includes('--resume');
if(!Number.isInteger(pairs)||pairs<1||pairs>50||!Number.isInteger(ms)||ms<1||ms>30000)throw Error('Invalid ablation budget');
const modes=['cache4','reserve','coverage8','combined8'],identity=verifyMazeBuild(),sourceFiles=['scripts/ablate-maze.mjs','scripts/evaluate-maze.mjs','scripts/verify-maze.mjs','evaluation/maze-candidate-policy.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(sourceFiles.map(async f=>[f,digest(await readFile(f))])));
const benchmarkExe=path.join(root,'experimental-engine/target/release',process.platform==='win32'?'eval-benchmark.exe':'eval-benchmark');
const benchmarkBinaryHash=digest(await readFile(benchmarkExe));
const archive=JSON.parse(await readFile('reports/native53/validation/report.json'));let positions=[];const inputs=[];
for(const e of archive.games.filter(g=>g.result==='loss')){const file=path.join('reports/native53/validation',e.file),bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});positions.push(...reconstructLoss(JSON.parse(bytes),{file,suite:e.suite}));}
positions=[...new Map(positions.map(p=>[positionKey(p.state),p])).values()];
const config={pairs,ms,maxPlies:180,modes},reportFile=path.join(out,'report.json');let report;
try{report=JSON.parse(await readFile(reportFile));if(!resume)throw Error('Use a fresh ablation directory or --resume');if(JSON.stringify(report.identity)!==JSON.stringify(identity)||JSON.stringify(report.sources)!==JSON.stringify(sourceHashes)||JSON.stringify(report.config)!==JSON.stringify(config)||JSON.stringify(report.inputs)!==JSON.stringify(inputs)||report.benchmarkBinaryHash!==benchmarkBinaryHash)throw Error('Ablation inputs changed');}
catch(e){if(e.code!=='ENOENT')throw e;report={format:'atlas-maze-ablation-v1',status:'running',identity,sources:sourceHashes,inputs,benchmarkBinaryHash,config,positions:positions.length,benchmarks:[],arenas:[],productionActive:false};}
await mkdir(out,{recursive:true});const save=()=>writeFile(reportFile,JSON.stringify(report,null,2)+'\n');
async function run(script,parameters){const child=spawn(process.execPath,[script,...parameters],{cwd:root,stdio:'inherit',windowsHide:true});const code=await new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',resolve);});if(code!==0)throw Error(`${script} failed: ${code}`);}
try{
 report.status='running';await save();
 if(!report.benchmarks.length){for(let i=0;i<3;i++){
  const result=spawnSync(benchmarkExe,[],{input:JSON.stringify(positions.map(p=>p.state)),encoding:'utf-8',windowsHide:true,maxBuffer:4*1024*1024});if(result.status!==0)throw Error(result.stderr||'Benchmark failed');const rows=JSON.parse(result.stdout);
  const scores=mode=>JSON.stringify(rows.find(r=>r.mode===mode).scores);
  if(scores('baseline')!==scores('cache4')||scores('reference8')!==scores('combined8'))throw Error('Evaluation equivalence failed');
  report.benchmarks.push(rows);await save();console.log(`benchmark ${i+1}/3: ${positions.length} legal archived states, equivalence passed`);
 }}
 for(const mode of modes){const directory=path.join(out,mode);let arena;
  try{arena=JSON.parse(await readFile(path.join(directory,'report.json')));if(arena.status!=='completed')throw Error('Partial arena exists; preserve it and restart the ablation in a fresh directory');}
  catch(e){if(e.code!=='ENOENT')throw e;await run('scripts/evaluate-maze.mjs',['--out',directory,'--mode',mode,'--split','development','--pairs',String(pairs),'--ms',String(ms),'--cores','4','--max-plies','180']);}
  await run('scripts/verify-maze.mjs',[directory,'--save']);arena=JSON.parse(await readFile(path.join(directory,'report.json')));
  if(!report.arenas.some(a=>a.mode===mode)){report.arenas.push({mode,file:path.relative(out,path.join(directory,'report.json')),sha256:digest(await readFile(path.join(directory,'report.json'))),summary:arena.summary,bySuite:Object.fromEntries(['general','maze'].map(s=>[s,Object.fromEntries(['win','loss','draw'].map(r=>[r,arena.games.filter(g=>g.suite===s&&g.result===r).length]))])),timing:arena.timing});await save();}
 }
 if(JSON.stringify(identity)!==JSON.stringify(verifyMazeBuild())||digest(await readFile(benchmarkExe))!==benchmarkBinaryHash)throw Error('Ablation binaries changed');
 for(const [f,h] of Object.entries(sourceHashes))if(digest(await readFile(f))!==h)throw Error('Ablation sources changed');
 report.status='completed';await save();
}catch(error){report.status='interrupted';report.error=error.message;await save();throw error;}
