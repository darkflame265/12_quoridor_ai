import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
import {reconstructLoss} from '../evaluation/native-diagnostics.mjs';
const out=process.argv[2];if(!out)throw Error('Specify fresh output JSON');
const identity=verifyMazeBuild(),reportFile='reports/forcing62/validation/report.json';
const reportBytes=await readFile(reportFile),archive=JSON.parse(reportBytes),inputs=[];let positions=[];
if(archive.status!=='completed')throw Error('Incomplete source arena');
for(const entry of archive.games.filter(g=>g.suite==='maze'&&g.result==='loss')) {
 const file=path.join(path.dirname(reportFile),entry.file),bytes=await readFile(file);
 if(digest(bytes)!==entry.sha256)throw Error('Archived game changed');
 const game=JSON.parse(bytes),found=reconstructLoss(game,{file,suite:entry.suite});
 positions.push(...found.map(p=>({...p,trace:game.trace.find(t=>t.ply===p.ply)})));
 inputs.push({file,sha256:digest(bytes),positions:found.length});
}
const exe='experimental-engine/target/release/eval-benchmark'+(process.platform==='win32'?'.exe':'');
const r=spawnSync(exe,['--forcing-analysis'],{input:JSON.stringify(positions.map(p=>p.state)),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,
 env:{...process.env,QUORIDOR_MAZE_SEARCH:'forcing',QUORIDOR_MAZE_GEOMETRY:'legacy',QUORIDOR_MAZE_ORDER_WEIGHT:'180',QUORIDOR_MAZE_THREAT_WEIGHT:'30'}});
if(r.status!==0)throw Error(r.stderr||'Loss analysis failed');
const rows=JSON.parse(r.stdout).map((row,i)=>({...row,source:positions[i].source.file,ply:positions[i].ply,
 state:positions[i].state,played:positions[i].played,completedDepth:positions[i].trace.depth,nodes:positions[i].trace.nodes}));
if(rows.length!==positions.length)throw Error('Missing analysis rows');
const threats=rows.flatMap(r=>r.threats.map(t=>({...t,index:r.index})));
const summary={games:inputs.length,positions:rows.length,positionsWithProtection:rows.filter(r=>r.protected.length).length,
 moreThanFourProtected:rows.filter(r=>r.protected.length>4).length,maximumProtected:Math.max(0,...rows.map(r=>r.protected.length)),
 missedBy4:threats.filter(t=>t.fullGain>t.fast4).length,missedBy8:threats.filter(t=>t.fullGain>t.fast8).length,
 largestGap4:Math.max(0,...threats.map(t=>t.fullGain-t.fast4)),largestGap8:Math.max(0,...threats.map(t=>t.fullGain-t.fast8))};
const result={format:'atlas-forcing-loss-analysis-v1',identity,sourceReport:{file:reportFile,sha256:digest(reportBytes)},inputs,
 scriptSha256:digest(await readFile('scripts/analyze-forcing-losses.mjs')),benchmarkSha256:digest(await readFile(exe)),summary,rows,
 productionActive:false,warning:'Exposed-loss diagnostics only. Full shortest-path threat scan is not a minimax proof or causal explanation of defeat.'};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
