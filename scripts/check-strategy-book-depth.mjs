import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {encode} from '../src/search.js';
import {digest} from '../evaluation/native-policy.mjs';
import {verifyRootGuardBuild,rootGuardExecutable} from '../evaluation/root-guard-policy.mjs';

const folder=process.argv[2];if(!folder)throw Error('Specify book report directory');
const bytes=await readFile(path.join(folder,'report.json')),report=JSON.parse(bytes),identity=verifyRootGuardBuild();
if(JSON.stringify(identity)!==JSON.stringify(report.identity.branchBuild))throw Error('Branch build changed');
const inputs=report.rows.map(r=>({state:r.state,depth:4,actions:r.branchReference.actions.map(a=>a.action)}));
const result=spawnSync(rootGuardExecutable.replace(/quoridor-root-guard(\.exe)?$/,'branches$1'),[],{input:JSON.stringify(inputs),encoding:'utf8',maxBuffer:16*1024*1024,windowsHide:true,env:{...process.env,QUORIDOR_ROOT_GUARD_MODE:'full'}});
if(result.status!==0)throw Error(result.stderr||'Depth-four branch audit failed');
const branches=JSON.parse(result.stdout);if(branches.length!==inputs.length)throw Error('Row mismatch');
const rows=report.rows.map((r,i)=>{
 const reference=branches[i],best=Math.max(...reference.actions.map(a=>a.score));
 const gap=s=>best-reference.actions.find(a=>a.action===encode(s.pv[0])).score;
 return {id:r.id,reference,fastDepth:r.searches.fast.depth,fastGap:gap(r.searches.fast),longDepth:r.searches.long?.depth??null,longGap:r.searches.long?gap(r.searches.long):null};
});
const summary={depth:4,positions:rows.length,fastInferior:rows.filter(r=>r.fastGap>0).length,fastSameDepthPositions:rows.filter(r=>r.fastDepth===4).length,fastSameDepthInferior:rows.filter(r=>r.fastDepth===4&&r.fastGap>0).length,longInferior:rows.filter(r=>r.longGap>0).length};
if(JSON.stringify(identity)!==JSON.stringify(verifyRootGuardBuild()))throw Error('Build changed during audit');
await writeFile(path.join(folder,'depth4.json'),JSON.stringify({sourceReportSha256:digest(bytes),scriptSha256:digest(await readFile('scripts/check-strategy-book-depth.mjs')),identity,summary,rows,caveat:'Only the recorded comparison set is ranked. A deeper timed search may legitimately disagree with a depth-four reference. Equal-depth deficits identify a selective-search discrepancy, not a proven losing move.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(summary,null,2));
