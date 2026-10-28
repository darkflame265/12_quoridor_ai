import {readFile,writeFile,mkdir} from 'node:fs/promises';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {NativeProcess} from '../server/native-process.mjs';import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';import {verifySpeedBuild,speedExecutable} from '../evaluation/speed-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';import {encode,decode} from '../src/search.js';import {legal,apply,moves} from '../src/engine.js';import {rotate} from '../evaluation/suite.js';
const out=process.argv[2];if(!out)throw Error('Specify fresh proof JSON');
const source='reports/diagnostic66/report.json',bytes=await readFile(source),ref=JSON.parse(bytes),verified=JSON.parse(await readFile('reports/diagnostic66/verification.json'));
if(ref.status!=='completed'||verified.reportSha256!==digest(bytes))throw Error('Reference changed');
const identity=verifyRootGuardBuild(),speedIdentity=verifySpeedBuild(),rows=[];
const same=(a,b)=>a.depth===b.depth&&a.score===b.score&&a.nodes===b.nodes&&JSON.stringify(a.pv)===JSON.stringify(b.pv);
async function search(state,mode,depth,ms=15000,cores=1){const client=new NativeProcess({executable:mode==='speed'?speedExecutable:rootGuardExecutable,profile:'candidate',env:{QUORIDOR_ROOT_GUARD_MODE:mode}});
 try{await client.health();const start=performance.now(),r=await client.search(state,{ms,cores,maxDepth:depth});let s=state;for(const a of r.pv){if(!legal(s,a))throw Error('Illegal PV');s=apply(s,a);}return {...r,mode,wallMs:performance.now()-start};}finally{client.close();}}
for(const [index,p] of ref.positions.entries()){
 const row={id:p.id,fixed:{},timed:{}};
 for(const depth of [3,4]){
  const a={};for(const mode of ['off','full','root','tactical'])a[mode]=await search(p.state,mode,depth);
  if(!same(a.off,p.searches[`selective${depth}`])||!same(a.full,p.searches[`full${depth}`]))throw Error('Off/full reference parity failed');
  if(depth===3&&!same(a.root,a.full))throw Error('Root-only depth-three protection failed');row.fixed[depth]=a;
 }
 for(const mode of index%2?['tactical','root','speed']:['speed','root','tactical'])row.timed[mode]=await search(p.state,mode,40,500,4);
 rows.push(row);
}
const inputs=[];
for(const [i,p] of ref.positions.entries())for(const depth of [3,4]){
 const actions=[...new Set(['off','full','root','tactical'].map(m=>encode(rows[i].fixed[depth][m].pv[0])))];inputs.push({state:p.state,depth,actions});
}
const base={p:[{x:0,y:5},{x:4,y:7}],walls:[],left:[1,1],turn:0,winner:null},safety=[base,rotate(base)];
for(const state of safety)inputs.push({state,depth:1,actions:Array.from({length:209},(_,a)=>a).filter(a=>legal(state,decode(a)))});
const exe=rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1');
const audited=spawnSync(exe,[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});if(audited.status!==0)throw Error(audited.stderr||'Branch audit failed');const branches=JSON.parse(audited.stdout);
let safetyChecks=0;
for(let i=0;i<safety.length;i++)for(const a of branches[ref.positions.length*2+i].actions){const s=safety[i],next=apply(s,decode(a.action)),enemy=1-s.turn,safe=next.winner===s.turn||!moves(next,enemy).some(m=>m.y===(enemy===0?0:8));if(a.tacticalProtected!==safe)throw Error('Immediate defense set mismatch');safetyChecks++;}
for(let i=0;i<rows.length;i++)for(const [offset,depth] of [3,4].entries()){
 const b=branches[i*2+offset],best=rows[i].fixed[depth].full.score;if(Math.max(...b.actions.map(a=>a.score))!==best)throw Error('Independent root branch values disagree with reference');
 rows[i].fixed[depth].branchReference=b;
 for(const mode of ['off','root','tactical']){const a=encode(rows[i].fixed[depth][mode].pv[0]),value=b.actions.find(x=>x.action===a);rows[i].fixed[depth][mode].referenceGap=best-value.score;}
}
const sum=(mode,key)=>rows.reduce((n,r)=>n+r.timed[mode][key],0),summary={states:rows.length,offParityChecks:rows.length*2,fullParityChecks:rows.length*2,rootDepth3Checks:rows.length,safetyChecks,immediateDefensesExact:true,
 modes:Object.fromEntries(['root','tactical'].map(mode=>[mode,{depth3Inferior:rows.filter(r=>r.fixed[3][mode].referenceGap>0).length,depth4Inferior:rows.filter(r=>r.fixed[4][mode].referenceGap>0).length,timedNodes:sum(mode,'nodes'),timedAverageDepth:sum(mode,'depth')/rows.length}])),speedTimedNodes:sum('speed','nodes'),speedTimedAverageDepth:sum('speed','depth')/rows.length};
if(JSON.stringify(verifyRootGuardBuild())!==JSON.stringify(identity))throw Error('Build changed');
await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify({format:'atlas-root-guard-proof-v1',identity,speedIdentity,source:{file:source,sha256:digest(bytes)},scriptSha256:digest(await readFile('scripts/check-root-guard.mjs')),summary,rows,safetyBranches:branches.slice(ref.positions.length*2),productionActive:false,warning:'Branch values use the same heuristic and fixed depth, not solved game outcomes.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
