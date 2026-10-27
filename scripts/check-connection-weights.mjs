import {readFile,writeFile,mkdir} from 'node:fs/promises';import {spawnSync} from 'node:child_process';import path from 'node:path';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';import {WEIGHT_PRESETS} from '../evaluation/connection-weight-presets.mjs';import {wallContact} from '../evaluation/wall-geometry.mjs';import {decode} from '../src/search.js';import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';import {digest} from '../evaluation/native-policy.mjs';
const out=process.argv[2];if(!out)throw Error('Specify a fresh weight proof file');
const identity=verifyMazeBuild(),exe=path.join('experimental-engine/target/release',process.platform==='win32'?'wall-geometry.exe':'wall-geometry');let states=[];const inputs=[];
const archive=JSON.parse(await readFile('reports/native53/validation/report.json'));
for(const e of archive.games.filter(g=>g.result==='loss')){const file=path.join('reports/native53/validation',e.file),bytes=await readFile(file);inputs.push({file,sha256:digest(bytes)});states.push(...reconstructLoss(JSON.parse(bytes),{file,suite:e.suite}).map(p=>p.state));}
const snapshots={};for(const preset of WEIGHT_PRESETS){
 const result=spawnSync(exe,['--weights'],{env:{...process.env,QUORIDOR_MAZE_MODE:'cache4',QUORIDOR_MAZE_SEARCH:'legacy',QUORIDOR_MAZE_GEOMETRY:'rank-eval',QUORIDOR_MAZE_ORDER_WEIGHT:String(preset.order),QUORIDOR_MAZE_THREAT_WEIGHT:String(preset.threat)},input:JSON.stringify(states),encoding:'utf-8',windowsHide:true,maxBuffer:4*1024*1024});if(result.status!==0)throw Error(result.stderr||'Weight snapshot failed');
 const data=JSON.parse(result.stdout);if(data.weights.order!==preset.order||data.weights.threat!==preset.threat)throw Error('Weights did not reach Rust');snapshots[preset.id]=data;
}
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
if(!same(snapshots.default.raw,snapshots.order90.raw)||!same(snapshots.default.cached,snapshots.order90.cached)||!same(snapshots.threat0.raw,snapshots.combined.raw)||!same(snapshots.threat0.cached,snapshots.combined.cached))throw Error('Order weight changed static evaluation');
if(!same(snapshots.default.rankings,snapshots.threat0.rankings)||!same(snapshots.order90.rankings,snapshots.combined.rankings))throw Error('Threat weight changed move-order scores');
let actionChecks=0;for(let i=0;i<states.length;i++){
 const base=snapshots.default.rankings[i],changed=snapshots.order90.rankings[i];if(base.length!==changed.length)throw Error('Weights changed legal action count');
 for(let j=0;j<base.length;j++){const [a,score]=base[j],[b,newScore]=changed[j];if(a!==b)throw Error('Weights changed legal action set');const contacts=a<81?0:states[i].walls.filter(w=>wallContact(decode(a),w)).length;if(newScore-score!==-90*contacts)throw Error('Order coefficient is not applied linearly');actionChecks++;}
}
const previous=JSON.parse(await readFile('reports/geometry58/scope-proof.json'));if(!same(snapshots.default.raw,previous.scores['rank-eval'].raw)||!same(snapshots.default.cached,previous.scores['rank-eval'].cached))throw Error('Default weights changed previous evaluation scores');
const changedStates=states.filter((_,i)=>snapshots.default.cached[i]!==snapshots.threat0.cached[i]).length;
const result={format:'atlas-connection-weight-proof-v1',identity,binarySha256:digest(await readFile(exe)),inputs,states:states.length,actionChecks,orderChangesStaticScores:false,threatChangesOrderScores:false,defaultScoresPreserved:true,threatChangedStates:changedStates,presets:WEIGHT_PRESETS,snapshots,productionActive:false};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({states:states.length,actionChecks,defaultScoresPreserved:true,threatChangedStates:changedStates}));
