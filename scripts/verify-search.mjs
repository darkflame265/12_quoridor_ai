import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {verifyMazeBuild,mazeSearchModes} from '../evaluation/maze-candidate-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
const directory=process.argv[2];if(!directory)throw Error('Specify the search comparison directory');
const bytes=await readFile(path.join(directory,'comparison.json')),report=JSON.parse(bytes);
if(report.format!=='atlas-search-comparison-v2'||report.status!=='completed'||report.searchModes.length<2||report.searchModes.some(m=>!mazeSearchModes.includes(m))||report.arenas.length!==report.searchModes.length||new Set(report.searchModes).size!==report.searchModes.length||!report.searchModes.includes('legacy')||JSON.stringify(report.identity)!==JSON.stringify(verifyMazeBuild()))throw Error('Incomplete or changed search comparison');
for(const [f,h] of Object.entries(report.sources))if(digest(await readFile(f))!==h)throw Error('Comparison source changed');
const modes=new Set();let games=0;
for(const entry of report.arenas){
 const file=path.resolve(directory,entry.file);if(!file.startsWith(path.resolve(directory)+path.sep))throw Error('Arena outside comparison');
 const data=await readFile(file),arena=JSON.parse(data);
 const bySuite=Object.fromEntries(['general','maze'].map(s=>[s,Object.fromEntries(['win','loss','draw'].map(r=>[r,arena.games.filter(g=>g.suite===s&&g.result===r).length]))]));
 if(JSON.stringify(bySuite)!==JSON.stringify(entry.bySuite)||entry.tactics!==arena.tactics.filter(t=>t.pass).length)throw Error('Comparison suite or tactic totals mismatch');
 if(digest(data)!==entry.sha256||arena.searchMode!==entry.searchMode||modes.has(entry.searchMode)||!mazeSearchModes.includes(entry.searchMode)||!report.searchModes.includes(entry.searchMode)||arena.mode!=='cache4'||arena.cohort!==report.cohort||arena.split!=='development'||arena.ms!==500||arena.cores!==4||arena.pairs!==1||JSON.stringify(arena.identity)!==JSON.stringify(report.identity)||JSON.stringify(arena.summary)!==JSON.stringify(entry.summary)||JSON.stringify(arena.timing)!==JSON.stringify(entry.timing))throw Error('Search comparison binding mismatch');
 const child=spawnSync(process.execPath,['scripts/verify-maze.mjs',path.dirname(file)],{encoding:'utf-8',windowsHide:true});if(child.status!==0)throw Error(child.stderr||'Arena verification failed');modes.add(entry.searchMode);games+=arena.games.length;
}
const result={reportSha256:digest(bytes),verifiedModes:[...modes],verifiedGames:games,productionActive:false};
await writeFile(path.join(directory,'verification.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result,null,2));
