import {readFile,writeFile} from 'node:fs/promises';
import {NativeProcess} from '../server/native-process.mjs';
import {openings,mazeOpenings} from '../evaluation/suite.js';
import {legal} from '../src/engine.js';
const baseline=JSON.parse(await readFile('reports/fast-engine/baseline.json')),fixtures=[...openings('validation',3),...mazeOpenings('validation',3)],samples=[];
for(const cores of [1,2,4]){const client=new NativeProcess();try{const cold=performance.now();await client.health();const startupMs=performance.now()-cold;for(const f of fixtures){const start=performance.now(),r=await client.search(f.state,{ms:500,cores});if(!legal(f.state,r.pv[0]))throw Error('Illegal native move');samples.push({fixture:f.id,cores,latencyMs:performance.now()-start,startupMs,...r});console.log(f.id,cores,r.depth,Math.round(samples.at(-1).latencyMs),r.sharedCacheHits);}}finally{client.close();}}
const summary={};for(const cores of [1,2,4]){const old=baseline.samples.filter(r=>r.cores===cores),fresh=samples.filter(r=>r.cores===cores),mean=(list,key)=>list.reduce((n,r)=>n+r[key],0)/list.length,p95=list=>list.map(r=>r.latencyMs).sort((a,b)=>a-b)[Math.ceil(list.length*.95)-1];summary[cores]={baselineMeanDepth:mean(old,'depth'),nativeMeanDepth:mean(fresh,'depth'),baselineP95:p95(old),nativeP95:p95(fresh)};}
const provenance=JSON.parse(await readFile('native-engine/target/release/source-manifest.json'));
await writeFile('reports/fast-engine/native-profile.json',JSON.stringify({date:new Date().toISOString(),budgetMs:500,provenance,samples,summary},null,2));console.log(JSON.stringify(summary,null,2));
