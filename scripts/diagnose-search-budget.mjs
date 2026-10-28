import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {digest,activeNativeProfile} from '../evaluation/native-policy.mjs';
import {probeExecutable,verifyProbeBuild} from '../evaluation/search-probe-policy.mjs';
import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';

const out=process.argv[2];if(!out)throw Error('Specify fresh output directory');
if(activeNativeProfile()!=='candidate')throw Error('Approved original unavailable');
await mkdir(out,{recursive:false});
const bytes=await readFile('reports/book70/first-run.json'),book=JSON.parse(bytes);
const ids=['inside-edge/balanced/rotated','inside-edge/attacker-poor/rotated','inside-edge/defender-poor/rotated','chamber-horizontal/balanced/normal','long-net/balanced/normal'];
const identity=verifyProbeBuild(),branchIdentity=verifyRootGuardBuild(),nativeBinary=digest(await readFile(nativeExecutable));
const bound=['scripts/diagnose-search-budget.mjs','evaluation/search-probe-policy.mjs','src/engine.js','src/search.js','server/native-process.mjs'];
const hashes=Object.fromEntries(await Promise.all(bound.map(async f=>[f,digest((await readFile(f,'utf8')).replaceAll('\r\n','\n'))])));
const rows=[],modes=['off','root','internal','full'];
const logical=r=>({depth:r.depth,score:r.score,nodes:r.nodes,pv:r.pv});
function validate(state,r){let p=state;if(!r.pv.length)throw Error('Missing PV');for(const a of r.pv){if(!legal(p,a))throw Error('Illegal PV');p=apply(p,a);}}
function probe(state,mode,{nodes=0,maxDepth=4,trace=true}={}){
 const r=spawnSync(probeExecutable,[],{input:JSON.stringify({state,ms:30000,cores:1,maxDepth}),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_PROBE_MODE:mode,QUORIDOR_PROBE_NODES:String(nodes),...(trace?{QUORIDOR_PROBE_TRACE:'1'}:{})}});
 if(r.status!==0)throw Error(r.stderr||'Probe failed');const value=JSON.parse(r.stdout);validate(state,value.result);
 if(nodes&&value.result.nodes!==nodes)throw Error('Node budget not exhausted; unsafe comparison');
 if(!nodes&&value.result.depth!==maxDepth)throw Error('Fixed depth incomplete');return value;
}
async function native(state,cores,maxDepth,ms){const e=new NativeProcess({profile:'candidate'});try{await e.health();const r=await e.search(state,{ms,cores,maxDepth});validate(state,r);return r;}finally{e.close();}}
for(const id of ids){
 const source=book.rows.find(r=>r.id===id);if(!source)throw Error('Missing fixture');const {state}=source;
 const baseline=await native(state,1,3,30000),parity=probe(state,'off',{maxDepth:3});
 if(JSON.stringify(logical(baseline))!==JSON.stringify(logical(parity.result)))throw Error('Uninstrumented native parity failed');
 const fixed={},budget={};
 for(const mode of modes){
  fixed[mode]=probe(state,mode);
  const first=probe(state,mode,{nodes:20000,maxDepth:40}),second=probe(state,mode,{nodes:20000,maxDepth:40});
  const deterministic=r=>({result:logical(r.result),iterations:r.iterations.map(logical),trace:r.trace});
  if(JSON.stringify(deterministic(first))!==JSON.stringify(deterministic(second)))throw Error('Node budget nondeterministic');
  budget[mode]={first,repeatLogicalSha256:digest(JSON.stringify(deterministic(second))),exactRepeat:true};
 }
 rows.push({id,state,baseline,parity,fixed,budget,timed:[]});console.log(`${id}: parity and four budget modes passed`);
}
// Time actual production binaries, not the trace-instrumented probe. Rotate
// fixture order each round to avoid always timing the same case first.
for(let round=0;round<3;round++)for(let offset=0;offset<rows.length;offset++){
 const row=rows[(offset+round)%rows.length];row.timed.push(await native(row.state,4,40,500));
}
const inputs=rows.map(r=>({state:r.state,depth:4,actions:[...new Set([...Object.values(r.fixed).map(v=>v.result.pv[0]),...Object.values(r.budget).map(v=>v.first.result.pv[0]),...r.timed.map(v=>v.pv[0])].map(encode))]}));
const audited=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
if(audited.status!==0)throw Error(audited.stderr||'Branch reference failed');const reference=JSON.parse(audited.stdout);
for(let i=0;i<rows.length;i++){
 const r=rows[i],ref=reference[i];r.reference=ref;
 if(Math.max(...ref.actions.map(a=>a.score))!==r.fixed.full.result.score)throw Error('Full width and independent branch reference disagree');
 const gap=value=>r.fixed.full.result.score-ref.actions.find(a=>a.action===encode(value.pv[0])).score;
 r.fixedGaps=Object.fromEntries(modes.map(m=>[m,gap(r.fixed[m].result)]));
 r.budgetGaps=Object.fromEntries(modes.map(m=>[m,gap(r.budget[m].first.result)]));
 r.timedGaps=r.timed.map(gap);
}
if(JSON.stringify(identity)!==JSON.stringify(verifyProbeBuild())||JSON.stringify(branchIdentity)!==JSON.stringify(verifyRootGuardBuild())||nativeBinary!==digest(await readFile(nativeExecutable)))throw Error('Build changed');
for(const [f,h] of Object.entries(hashes))if(h!==digest((await readFile(f,'utf8')).replaceAll('\r\n','\n')))throw Error('Tools changed');
const summary={positions:rows.length,parityChecks:rows.length,exactNodeBudgetRepeats:rows.length*4,nodeBudget:20000,nodeBudgetCores:1,timedSearches:rows.length*3,timedActionVaries:rows.filter(r=>new Set(r.timed.map(v=>encode(v.pv[0]))).size>1).length,timedDepthVaries:rows.filter(r=>new Set(r.timed.map(v=>v.depth)).size>1).length,modes:Object.fromEntries(modes.map(m=>[m,{fixedDepthInferior:rows.filter(r=>r.fixedGaps[m]>0).length,budgetInferiorAtDepth4:rows.filter(r=>r.budgetGaps[m]>0).length,budgetDepths:rows.map(r=>r.budget[m].first.result.depth)}]))};
await writeFile(path.join(out,'report.json'),JSON.stringify({format:'atlas-search-budget-v1',identity,branchIdentity,nativeBinary,source:{file:'reports/book70/first-run.json',sha256:digest(bytes)},hashes,summary,rows,productionChanged:false,warning:'Node budgets are single-core negamax entries, not total CPU work. Root trace fail-low scores are bounds, not exact branch values. Depth-four values use the old heuristic; limited samples do not establish strength.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
