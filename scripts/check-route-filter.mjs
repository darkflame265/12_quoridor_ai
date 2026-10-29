import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {filterExecutable,verifyFilterBuild} from '../evaluation/route-filter-policy.mjs';
import {rootGuardExecutable,verifyRootGuardBuild} from '../evaluation/root-guard-policy.mjs';
import {digest} from '../evaluation/native-policy.mjs';
import {legal,apply} from '../src/engine.js';
import {encode} from '../src/search.js';
const out=process.argv[2];if(!out)throw Error('Specify fresh output folder');await mkdir(out,{recursive:false});
const bytes=await readFile('reports/budget71/report.json'),base=JSON.parse(bytes),boundaryBytes=await readFile('reports/budget71/boundary.json'),boundary=JSON.parse(boundaryBytes);
const identity=verifyFilterBuild(),branchIdentity=verifyRootGuardBuild(),modes=['exit','dag'],rows=[];
function run(state,mode,nodes,maxDepth){
 const call=spawnSync(filterExecutable,[],{input:JSON.stringify({state,ms:30000,cores:1,maxDepth}),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_ROUTE_FILTER:mode,QUORIDOR_PROBE_MODE:'off',QUORIDOR_PROBE_NODES:String(nodes)}});
 if(call.status!==0)throw Error(call.stderr||'Candidate failed');const value=JSON.parse(call.stdout);let s=state;
 if(!value.result.pv.length)throw Error('No PV');for(const a of value.result.pv){if(!legal(s,a))throw Error('Illegal PV');s=apply(s,a);}
 if(nodes?value.result.nodes!==nodes:value.result.depth!==maxDepth)throw Error('Incomplete comparison');
 const cap=mode==='off'?0:12;
 if(value.orderingWork.maxPerCall>cap||mode==='off'&&(value.orderingWork.calls||value.orderingWork.evaluations))throw Error('Ordering work cap violated');return value;
}
const logical=r=>({depth:r.depth,score:r.score,nodes:r.nodes,pv:r.pv});
for(const r of base.rows){
 const parity=run(r.state,'off',0,3);if(JSON.stringify(logical(parity.result))!==JSON.stringify(logical(r.baseline)))throw Error('Off/native parity failed');
 const candidate={};for(const mode of modes){
  const fixed=run(r.state,mode,0,4),budget=run(r.state,mode,50000,40),repeat=run(r.state,mode,50000,40);
  if(JSON.stringify(logical(budget.result))!==JSON.stringify(logical(repeat.result))||JSON.stringify(budget.orderingWork)!==JSON.stringify(repeat.orderingWork))throw Error('Budget repeat differs');
  candidate[mode]={fixed,budget,repeatSha256:digest(JSON.stringify(logical(repeat.result)))};
 }
 rows.push({id:r.id,state:r.state,parity,candidate,baselineFixed:r.fixed.off.result,baselineBudget:boundary.rows.find(s=>s.id===r.id).off,fullScore:r.fixed.full.result.score,fullAction:r.fixed.full.result.pv[0]});
 console.log(`${r.id}: boundary modes completed`);
}
const inputs=rows.map(r=>({state:r.state,depth:4,actions:[...new Set([r.fullAction,r.baselineFixed.pv[0],r.baselineBudget.pv[0],...Object.values(r.candidate).flatMap(v=>[v.fixed.result.pv[0],v.budget.result.pv[0]])].map(encode))]}));
const call=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',windowsHide:true,maxBuffer:16*1024*1024,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
if(call.status!==0)throw Error(call.stderr||'Reference failed');const refs=JSON.parse(call.stdout);
for(let i=0;i<rows.length;i++){
 const r=rows[i];r.reference=refs[i];if(Math.max(...r.reference.actions.map(a=>a.score))!==r.fullScore)throw Error('Full reference differs');
 const gap=v=>r.fullScore-r.reference.actions.find(a=>a.action===encode(v.pv[0])).score;
 r.baselineFixedGap=gap(r.baselineFixed);for(const v of Object.values(r.candidate)){v.fixedGap=gap(v.fixed.result);v.budgetGap=gap(v.budget.result);}
}
const summary=Object.fromEntries(modes.map(mode=>{
 const fixedImproved=rows.filter(r=>r.candidate[mode].fixedGap<r.baselineFixedGap).length,fixedWorse=rows.filter(r=>r.candidate[mode].fixedGap>r.baselineFixedGap).length;
 const budgetImproved=rows.filter(r=>r.candidate[mode].budgetGap<r.baselineBudget.referenceGap).length,budgetWorse=rows.filter(r=>r.candidate[mode].budgetGap>r.baselineBudget.referenceGap).length,depthRegressions=rows.filter(r=>r.candidate[mode].budget.result.depth<r.baselineBudget.depth).length;
 return [mode,{fixedImproved,fixedWorse,budgetImproved,budgetWorse,depthRegressions,eligibleForTimedTrial:fixedImproved>0&&fixedWorse===0&&budgetImproved>0&&budgetWorse===0&&depthRegressions===0}];
}));
if(JSON.stringify(identity)!==JSON.stringify(verifyFilterBuild())||JSON.stringify(branchIdentity)!==JSON.stringify(verifyRootGuardBuild()))throw Error('Build changed');
await writeFile(path.join(out,'report.json'),JSON.stringify({format:'atlas-route-filter-v1',identity,branchIdentity,sources:[{file:'reports/budget71/report.json',sha256:digest(bytes)},{file:'reports/budget71/boundary.json',sha256:digest(boundaryBytes)}],scriptSha256:digest(await readFile('scripts/check-route-filter.mjs')),summary,rows,productionChanged:false,warning:'Ordering only, no evaluation or LMR rule changes. Reference values are old-heuristic depth-four scores, not proven outcomes. These five exposed cases are a development gate only.'},null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(summary,null,2));
