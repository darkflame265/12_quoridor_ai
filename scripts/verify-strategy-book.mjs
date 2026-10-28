import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {bookCases,wallEffect,actionKey} from '../evaluation/strategy-book.mjs';
import {replayRecords,positionKey} from '../src/spectator.js';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';
import {nativeExecutable} from '../server/native-process.mjs';
import {digest,nativeSourceHash} from '../evaluation/native-policy.mjs';
import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';

const folder=process.argv[2];if(!folder)throw Error('Specify report directory');
const bytes=await readFile(path.join(folder,'report.json')),report=JSON.parse(bytes),cases=bookCases();
assert.equal(report.format,'atlas-strategy-book-v1');assert.equal(report.productionChanged,false);
assert.equal(report.identity.nativeSourceHash,nativeSourceHash());
assert.equal(report.identity.nativeBinarySha256,digest(await readFile(nativeExecutable)));
assert.deepEqual(report.identity.branchBuild,verifyRootGuardBuild());
assert.equal(report.identity.filesEncoding,'utf8-lf');
for(const [f,sha] of Object.entries(report.identity.files))assert.equal(digest((await readFile(f,'utf8')).replaceAll('\r\n','\n')),sha,f);
assert.equal(report.rows.length,cases.length);
const inputs=[];
for(const [i,c] of cases.entries()){
 const r=report.rows[i];for(const [key,value] of Object.entries(c))assert.deepEqual(r[key],value,`${c.id}/${key}`);
 const replayBytes=await readFile(path.join(folder,r.replay));assert.equal(digest(replayBytes),r.replaySha256);
 assert.equal(positionKey(replayRecords(JSON.parse(replayBytes)).state),positionKey(c.state));
 const effects=[];for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  const action={type:'wall',o,x,y},e=wallEffect(c.state,action);if(e)effects.push({action,...e});
 }
 assert.deepEqual(r.effects,effects);
 assert.deepEqual(r.comparedEffects,c.compare.map(action=>({action,...wallEffect(c.state,action)})));
 const actions=[...new Set([...c.compare,r.searches.fast.pv[0],...(r.searches.long?[r.searches.long.pv[0]]:[])].map(encode))];
 inputs.push({state:c.state,depth:3,actions});
 assert.equal(!!r.searches.long,c.assumptions.stock==='balanced');
 for(const [kind,s] of Object.entries(r.searches))if(s){
  assert.equal(s.budgetMs,kind==='fast'?500:2000);assert.equal(s.cores,4);
  let state=c.state;for(const a of s.pv){assert.ok(legal(state,a));state=apply(state,a);}
  const best=Math.max(...r.branchReference.actions.map(a=>a.score));
  assert.equal(s.comparisonGap,best-r.branchReference.actions.find(a=>a.action===encode(s.pv[0])).score);
  assert.equal(s.bookMove,c.compare.some(a=>actionKey(a)===actionKey(s.pv[0])));
 }
}
const result=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
assert.equal(result.status,0,result.stderr);
const branches=JSON.parse(result.stdout);
for(let i=0;i<cases.length;i++)assert.deepEqual(branches[i].actions.map(a=>[a.action,a.score]),report.rows[i].branchReference.actions.map(a=>[a.action,a.score]));
const rows=report.rows,summary={positions:rows.length,diagrams:5,fastInferiorWithinComparedSet:rows.filter(r=>r.searches.fast.comparisonGap>0).length,longPositions:rows.filter(r=>r.searches.long).length,longInferiorWithinComparedSet:rows.filter(r=>r.searches.long?.comparisonGap>0).length,fastBookMove:rows.filter(r=>r.searches.fast.bookMove).length,longActionChanges:rows.filter(r=>r.searches.long&&actionKey(r.searches.fast.pv[0])!==actionKey(r.searches.long.pv[0])).length};
assert.deepEqual(report.summary,summary);
const depthBytes=await readFile(path.join(folder,'depth4.json')),depth=JSON.parse(depthBytes);
assert.equal(depth.sourceReportSha256,digest(bytes));assert.deepEqual(depth.identity,report.identity.branchBuild);
assert.equal(depth.scriptSha256,digest(await readFile('scripts/check-strategy-book-depth.mjs')));
const deeper=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs.map(r=>({...r,depth:4}))),encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
assert.equal(deeper.status,0,deeper.stderr);const deeperBranches=JSON.parse(deeper.stdout);
assert.equal(depth.rows.length,cases.length);
for(let i=0;i<cases.length;i++){
 const d=depth.rows[i],r=report.rows[i];assert.equal(d.id,r.id);
 assert.deepEqual(d.reference.actions.map(a=>[a.action,a.score]),deeperBranches[i].actions.map(a=>[a.action,a.score]));
 const best=Math.max(...deeperBranches[i].actions.map(a=>a.score));
 const gap=s=>best-deeperBranches[i].actions.find(a=>a.action===encode(s.pv[0])).score;
 assert.equal(d.fastGap,gap(r.searches.fast));assert.equal(d.fastDepth,r.searches.fast.depth);
 assert.equal(d.longGap,r.searches.long?gap(r.searches.long):null);assert.equal(d.longDepth,r.searches.long?.depth??null);
}
assert.deepEqual(depth.summary,{depth:4,positions:depth.rows.length,fastInferior:depth.rows.filter(r=>r.fastGap>0).length,fastSameDepthPositions:depth.rows.filter(r=>r.fastDepth===4).length,fastSameDepthInferior:depth.rows.filter(r=>r.fastDepth===4&&r.fastGap>0).length,longInferior:depth.rows.filter(r=>r.longGap>0).length});
// Optional archived first timing run: verify its evidence without pretending
// the old checker hash belongs to the current portable checker revision.
let firstRun=null;
try{
 const firstBytes=await readFile(path.join(folder,'first-run.json')),first=JSON.parse(firstBytes),firstDepthBytes=await readFile(path.join(folder,'first-run-depth4.json')),firstDepth=JSON.parse(firstDepthBytes),receipt=JSON.parse(await readFile(path.join(folder,'first-run-verification.json')));
 assert.equal(digest(firstBytes),receipt.reportSha256);assert.equal(digest(firstDepthBytes),receipt.depth4Sha256);
 assert.deepEqual(first.identity.branchBuild,verifyRootGuardBuild());assert.equal(first.rows.length,cases.length);
 for(let i=0;i<cases.length;i++){
  const r=first.rows[i];assert.equal(r.id,cases[i].id);assert.deepEqual(r.state,cases[i].state);assert.deepEqual(r.effects,report.rows[i].effects);
  assert.equal(firstDepth.rows[i].id,r.id);
  for(const s of Object.values(r.searches).filter(Boolean)){let p=r.state;for(const a of s.pv){assert.ok(legal(p,a));p=apply(p,a);}}
 }
 for(const [d,references] of [[3,first.rows.map(r=>r.branchReference)],[4,firstDepth.rows.map(r=>r.reference)]]){
  const originalInputs=first.rows.map((r,i)=>({state:r.state,depth:d,actions:references[i].actions.map(a=>a.action)}));
  const check=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(originalInputs),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
  assert.equal(check.status,0,check.stderr);const result=JSON.parse(check.stdout);
  for(let i=0;i<cases.length;i++)assert.deepEqual(result[i].actions.map(a=>[a.action,a.score]),references[i].actions.map(a=>[a.action,a.score]));
 }
 firstRun={reportSha256:digest(firstBytes),depth4Sha256:digest(firstDepthBytes),fixedBranchSetsRecomputed:cases.length*2,firstActionsChanged:report.rows.filter((r,i)=>actionKey(r.searches.fast.pv[0])!==actionKey(first.rows[i].searches.fast.pv[0])).length,completedDepthChanged:report.rows.filter((r,i)=>r.searches.fast.depth!==first.rows[i].searches.fast.depth).length};
}catch(error){if(error.code!=='ENOENT')throw error;}
const verification={reportSha256:digest(bytes),depth4Sha256:digest(depthBytes),sourceProvenanceSha256:digest(await readFile(path.join(folder,'sources.json'))),verifierSha256:digest(await readFile('scripts/verify-strategy-book.mjs')),replaysVerified:cases.length,geometricWallScansVerified:cases.length,fixedBranchSetsRecomputed:cases.length*2,summary,depth4Summary:depth.summary,firstRun};
await writeFile(path.join(folder,'verification.json'),JSON.stringify(verification,null,2)+'\n');console.log(JSON.stringify(verification,null,2));
