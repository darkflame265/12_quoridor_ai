import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';
import {NativeProcess} from '../server/native-process.mjs';import {speedExecutable,verifySpeedBuild} from '../evaluation/speed-policy.mjs';
import {guardExecutable,verifyGuardBuild} from '../evaluation/guard-policy.mjs';import {digest} from '../evaluation/native-policy.mjs';import {legal,apply} from '../src/engine.js';
const out=process.argv[2];if(!out)throw Error('Specify fresh output JSON');
const source='reports/diagnostic66/report.json',bytes=await readFile(source),previous=JSON.parse(bytes),verification=JSON.parse(await readFile('reports/diagnostic66/verification.json'));
if(previous.status!=='completed'||verification.reportSha256!==digest(bytes))throw Error('Diagnostic reference changed');
const identity=verifyGuardBuild(),speedIdentity=verifySpeedBuild(),rows=[];
async function search(state,exe,options){const client=new NativeProcess({executable:exe,profile:'candidate'});try{await client.health();const start=performance.now(),r=await client.search(state,options);let s=state;for(const a of r.pv){if(!legal(s,a))throw Error('Illegal PV');s=apply(s,a);}return {...r,wallMs:performance.now()-start};}finally{client.close();}}
for(const [index,p] of previous.positions.entries()){
 const row={id:p.id,fixed:{},timed:{}};
 for(const depth of [3,4]){
  const r=await search(p.state,guardExecutable,{ms:15000,cores:1,maxDepth:depth}),reference=p.searches[`full${depth}`];
  if(r.depth!==reference.depth||r.score!==reference.score||r.nodes!==reference.nodes||JSON.stringify(r.pv)!==JSON.stringify(reference.pv))throw Error(`Guard does not match full-width reference: ${p.id}, ${depth}`);
  row.fixed[depth]=r;
 }
 for(const key of index%2?['guard','speed']:['speed','guard'])row.timed[key]=await search(p.state,key==='guard'?guardExecutable:speedExecutable,{ms:500,cores:4});
 rows.push(row);
}
if(JSON.stringify(verifyGuardBuild())!==JSON.stringify(identity))throw Error('Guard changed during proof');
const sum=(key,field)=>rows.reduce((n,r)=>n+r.timed[key][field],0);
const summary={states:rows.length,fixedChecks:rows.length*2,allFixedScoresMovesNodesMatch:true,timedSpeedNodes:sum('speed','nodes'),timedGuardNodes:sum('guard','nodes'),timedSpeedDepth:sum('speed','depth')/rows.length,timedGuardDepth:sum('guard','depth')/rows.length};
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({format:'atlas-guard-proof-v1',identity,speedIdentity,source:{file:source,sha256:digest(bytes)},scriptSha256:digest(await readFile('scripts/check-guard.mjs')),summary,rows,productionActive:false},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
