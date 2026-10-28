import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {homedir} from 'node:os';
import path from 'node:path';
import {digest,nativeSourceHash,nativeSources} from '../evaluation/native-policy.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';
const folder=process.argv[2];if(!folder)throw Error('Specify budget report folder');
const build=spawnSync(path.join(homedir(),'.cargo','bin',process.platform==='win32'?'cargo.exe':'cargo'),['build','--locked','--release','--manifest-path','chain-guard-engine/Cargo.toml'],{stdio:'inherit',windowsHide:true});if(build.status!==0)throw Error('Build failed');
const exe=`chain-guard-engine/target/release/quoridor-chain-guard${process.platform==='win32'?'.exe':''}`;
const sourceBytes=await readFile(path.join(folder,'report.json')),ref=JSON.parse(sourceBytes),rows=[];
const files=[...nativeSources,'search-probe-engine/src/probe.rs','chain-guard-engine/Cargo.toml','chain-guard-engine/Cargo.lock','chain-guard-engine/build.rs','chain-guard-engine/src/main.rs','chain-guard-engine/src/chain.rs','scripts/check-chain-guard.mjs'];
const identity={nativeSourceHash:nativeSourceHash(),sources:Object.fromEntries(await Promise.all(files.map(async f=>[f,digest(await readFile(f))]))),binarySha256:digest(await readFile(exe))};
// Predeclared development gate: recover at least one reference choice under
// the SAME 20k node budget, with no reference-gap or completed-depth regression.
for(const r of ref.rows){
 const results={};for(const [kind,nodes,maxDepth] of [['fixed',0,4],['budget',20000,40]]){
  const call=spawnSync(exe,[],{input:JSON.stringify({state:r.state,ms:30000,cores:1,maxDepth}),encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,env:{...process.env,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:String(nodes)}});
  if(call.status!==0)throw Error(call.stderr||'Candidate failed');const value=JSON.parse(call.stdout);let state=r.state;
  for(const a of value.result.pv){if(!legal(state,a))throw Error('Illegal candidate PV');state=apply(state,a);}
  if(nodes?value.result.nodes!==nodes:value.result.depth!==4)throw Error('Incomplete comparison');
  const action=encode(value.result.pv[0]),branch=r.reference.actions.find(a=>a.action===action);
  if(!branch)throw Error('New branch needs independent reference; stop gate');
  results[kind]={...value.result,referenceGap:r.fixed.full.result.score-branch.score};
 }rows.push({id:r.id,...results,baselineBudget:r.budget.off.first.result,baselineBudgetGap:r.budgetGaps.off,baselineFixedGap:r.fixedGaps.off});
}
const checks={fixedImprovement:rows.some(r=>r.fixed.referenceGap<r.baselineFixedGap),budgetImprovement:rows.some(r=>r.budget.referenceGap<r.baselineBudgetGap),budgetNoRegression:rows.every(r=>r.budget.referenceGap<=r.baselineBudgetGap&&r.budget.depth>=r.baselineBudget.depth)};
const report={format:'atlas-chain-guard-v1',identity,sourceReportSha256:digest(sourceBytes),checks,eligibleForArena:Object.values(checks).every(Boolean),productionChanged:false,rows,warning:'Development fixtures are exposed. Passing only authorizes broader arena testing; no automatic engine promotion.'};
await writeFile(path.join(folder,'chain-candidate.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(checks,null,2));
