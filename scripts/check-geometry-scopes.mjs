import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {wallContact} from '../evaluation/wall-geometry.mjs';
import {decode} from '../src/search.js';
import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const out=process.argv[2];if(!out)throw Error('Specify a fresh scope proof file');
const identity=verifyMazeBuild(),exe=path.join('experimental-engine/target/release',process.platform==='win32'?'wall-geometry.exe':'wall-geometry');
const modes=['legacy','rank-only','eval-only','rank-eval','physical'],snapshots={},scores={},inputs=[];let states=[];
const original=JSON.parse(await readFile('reports/native53/validation/report.json'));
for(const e of original.games.filter(g=>g.result==='loss')){const file=path.join('reports/native53/validation',e.file),bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});states.push(...reconstructLoss(JSON.parse(bytes),{file,suite:e.suite}).map(p=>p.state));}
for(const mode of modes){
 const env={...process.env,QUORIDOR_MAZE_GEOMETRY:mode,QUORIDOR_MAZE_MODE:'cache4',QUORIDOR_MAZE_SEARCH:'legacy'};
 const run=args=>{const r=spawnSync(exe,args,{env,input:args.length?JSON.stringify(states):undefined,encoding:'utf-8',windowsHide:true,maxBuffer:2*1024*1024});if(r.status!==0)throw Error(r.stderr||'Scope snapshot failed');return JSON.parse(r.stdout);};
 snapshots[mode]=run([]);scores[mode]=run(['--scores']);
}
let pairChecks=0;
for(const mode of modes)for(let a=0;a<128;a++)for(let b=0;b<128;b++){
 const corrected=Number(wallContact(decode(a+81),decode(b+81))),old=snapshots.legacy.legacy[a][b],s=snapshots[mode];
 for(const [field,physical] of [['ranking',['rank-only','rank-eval','physical'].includes(mode)],['evaluation',['eval-only','rank-eval','physical'].includes(mode)],['counts',mode==='physical']]){
  if(s[field][a][b]!== (physical?corrected:old))throw Error(`Wrong scope ${mode}:${field}:${a}:${b}`);pairChecks++;
 }
}
if(JSON.stringify(scores.legacy)!==JSON.stringify(scores['rank-only']))throw Error('Ranking-only changed static evaluation');
for(const mode of ['rank-eval','physical'])if(JSON.stringify(scores['eval-only'])!==JSON.stringify(scores[mode]))throw Error('Evaluation scopes diverged');
const changed=states.filter((_,i)=>scores.legacy.cached[i]!==scores['rank-eval'].cached[i]).length;
const result={format:'atlas-geometry-scope-proof-v1',identity,binarySha256:digest(await readFile(exe)),referenceSha256:digest(await readFile('evaluation/wall-geometry.mjs')),inputs,states:states.length,pairChecks,rankOnlyStaticScoresIdentical:true,evalScopesStaticScoresIdentical:true,positionsChangedByEvaluation:changed,scores,productionActive:false};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({states:states.length,pairChecks,rankOnlyStaticScoresIdentical:true,positionsChangedByEvaluation:changed}));
