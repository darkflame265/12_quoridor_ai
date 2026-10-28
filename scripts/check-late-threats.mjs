import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';
import {verifyMazeBuild} from '../evaluation/maze-candidate-policy.mjs';
const out=process.argv[2];if(!out)throw Error('Specify fresh output JSON');
const source='reports/forcing63/analysis.json',bytes=await readFile(source),previous=JSON.parse(bytes);
const states=previous.rows.map(r=>r.state),identity=verifyMazeBuild();
const exe='experimental-engine/target/release/eval-benchmark'+(process.platform==='win32'?'.exe':'');
function run(args){const r=spawnSync(exe,args,{input:JSON.stringify(states),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,
 env:{...process.env,QUORIDOR_MAZE_GEOMETRY:'legacy',QUORIDOR_MAZE_ORDER_WEIGHT:'180',QUORIDOR_MAZE_THREAT_WEIGHT:'30'}});
 if(r.status!==0)throw Error(r.stderr||'Late-threat check failed');return JSON.parse(r.stdout);}
const rows=run(['--forcing-analysis']),timings=run([]),threats=rows.flatMap(r=>r.threats);
for(const [i,r] of rows.entries())for(const t of r.threats){const old=previous.rows[i].threats.find(o=>o.target===t.target);
 if(t.fast4!==old.fast4||t.fullGain!==old.fullGain)throw Error('Reference changed');
 if(t.lateFull<t.fast4||t.lateFull>t.fullGain)throw Error('Threat outside reference bounds');}
const summary={states:states.length,observations:threats.length,missedBefore:threats.filter(t=>t.fullGain>t.fast4).length,
 missedAfter:threats.filter(t=>t.fullGain>t.lateFull).length,maximumGapAfter:Math.max(0,...threats.map(t=>t.fullGain-t.lateFull))};
const result={format:'atlas-late-threat-proof-v1',identity,source:{file:source,sha256:digest(bytes)},scriptSha256:digest(await readFile('scripts/check-late-threats.mjs')),
 benchmarkSha256:digest(await readFile(exe)),summary,timings,rows,productionActive:false,warning:'Exposed development diagnostics; isolated evaluation timing is not full-search speed or strength'};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({summary,timings:timings.map(({mode,coldMicros,warmMicros})=>({mode,coldMicros,warmMicros}))},null,2));
