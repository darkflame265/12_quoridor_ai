import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import {verifyBoundaryBuild} from '../evaluation/boundary-order-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {encode,decode} from '../src/search.js';
import {legal,apply} from '../src/engine.js';
const folder=process.argv[2];if(!folder)throw Error('Specify boundary report folder');
const build=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','boundary-order-engine/Cargo.toml','--bin','ranks'],{stdio:'inherit',windowsHide:true});if(build.status!==0)throw Error('Rank audit build failed');
const bytes=await readFile(path.join(folder,'report.json')),r=JSON.parse(bytes),identity=verifyBoundaryBuild();assert.deepEqual(identity,r.identity);
const exe=`boundary-order-engine/target/release/ranks${process.platform==='win32'?'.exe':''}`;
const inputs=r.rows.map(row=>({state:row.state,actions:[...new Set([row.baselineFixed.pv[0],row.fullAction].map(encode))]}));
const modes={};for(const mode of ['window','promote']){
 const call=spawnSync(exe,[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_PROBE_MODE:'full',QUORIDOR_PROBE_NODES:'0',QUORIDOR_BOUNDARY_ORDER:mode,QUORIDOR_RESPONSE_ORDER:'static'}});
 assert.equal(call.status,0,call.stderr);modes[mode]=JSON.parse(call.stdout);
 for(let i=0;i<r.rows.length;i++)for(const b of modes[mode][i]){
  const expected=r.rows[i].reference.actions.find(a=>a.action===b.action);assert.ok(expected);assert.equal(b.rootValue,expected.score);
  const child=apply(r.rows[i].state,decode(b.action));assert.ok(legal(child,decode(b.reply)));
 }
}
const result={sourceReportSha256:digest(bytes),identity,binarySha256:digest(await readFile(exe)),sources:Object.fromEntries(await Promise.all(['boundary-order-engine/src/bin/ranks.rs','response-order-engine/src/ordering.rs','scripts/audit-boundary-ranks.mjs'].map(async f=>[f,digest(await readFile(f))]))),ids:r.rows.map(v=>v.id),modes,warning:'One optimal depth-three reply per child under the old heuristic. Cold ranks exclude TT/history/killers and do not prove actual search-time LMR eligibility. Indices are zero-based.'};
const file=path.join(folder,'rank-audit.json');if(process.argv.includes('--verify')){const saved=await readFile(file);assert.deepEqual(JSON.parse(saved),result);await writeFile(path.join(folder,'rank-verification.json'),JSON.stringify({reportSha256:digest(saved),branchesRecomputed:Object.values(modes).reduce((n,v)=>n+v.reduce((a,b)=>a+b.length,0),0)},null,2)+'\n');}else await writeFile(file,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(Object.fromEntries(Object.entries(modes).map(([mode,rows])=>[mode,rows.map((b,i)=>({id:result.ids[i],ranks:b.map(v=>[v.coldIndex,v.limitedIndex,v.staticIndex])}))])),null,2));
