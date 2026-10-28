import {readFile,writeFile} from 'node:fs/promises';import path from 'node:path';
import {digest} from '../evaluation/native-policy.mjs';import {wilson} from '../evaluation/suite.js';
const [directory,out]=process.argv.slice(2);if(!out)throw Error('Specify completed arena directory and fresh output JSON');
const file=path.join(directory,'report.json'),bytes=await readFile(file),r=JSON.parse(bytes);if(r.status!=='completed')throw Error('Incomplete arena');
const bySuite={},roles={};
for(const suite of ['general','maze'])bySuite[suite]=Object.fromEntries(['win','loss','draw'].map(result=>[result,r.games.filter(g=>g.suite===suite&&g.result===result).length]));
for(const role of ['candidate','baseline'])roles[role]={moves:0,nodes:0,totalDepth:0,elapsedMs:0,sharedCacheHits:0,endgameHits:0};
for(const game of r.games){const data=await readFile(path.join(directory,game.file));if(digest(data)!==game.sha256)throw Error('Replay changed');
 for(const move of JSON.parse(data).trace){const t=roles[move.role];t.moves++;t.nodes+=move.nodes;t.totalDepth+=move.depth;t.elapsedMs+=move.elapsedMs;t.sharedCacheHits+=move.sharedCacheHits??0;t.endgameHits+=move.endgameHits??0;}}
for(const role of Object.keys(roles)){const t=roles[role];t.averageDepth=t.totalDepth/t.moves;t.nodesPerSecond=t.nodes/t.elapsedMs*1000;}
const summary={source:{file,sha256:digest(bytes)},summary:r.summary,bySuite,decisiveWilson95:wilson(r.summary.win,r.summary.loss),roles,
 caution:'Arena roles reach different positions; use matched-position benchmark for controlled speed. Wilson excludes draws and does not account for paired-game dependence.',productionActive:false};
await writeFile(out,JSON.stringify(summary,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({summary:r.summary,bySuite,decisiveWilson95:summary.decisiveWilson95}));
