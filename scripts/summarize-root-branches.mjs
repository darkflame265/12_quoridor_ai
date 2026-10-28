import {readFile,writeFile} from 'node:fs/promises';import {digest} from '../evaluation/native-policy.mjs';import {encode} from '../src/search.js';
const [proofFile,out]=process.argv.slice(2);if(!out)throw Error('Specify proof JSON and fresh branch-summary JSON');
const bytes=await readFile(proofFile),proof=JSON.parse(bytes),sourceBytes=await readFile(proof.source.file);if(digest(sourceBytes)!==proof.source.sha256)throw Error('Reference changed');const source=JSON.parse(sourceBytes),rows=[];
for(const row of proof.rows)for(const depth of [3,4])for(const mode of ['off','root','tactical']){
 const r=row.fixed[depth][mode],a=encode(r.pv[0]),branch=row.fixed[depth].branchReference.actions.find(b=>b.action===a),full=row.fixed[depth].full;
 rows.push({id:row.id,depth,mode,action:r.pv[0],reportedScore:r.score,referenceBranchScore:branch.score,overstatement:r.score-branch.score,bestReferenceScore:full.score,referenceGap:full.score-branch.score});
}
const rootCases=rows.filter(r=>r.mode==='root'&&r.overstatement!==0).map(r=>({...r,state:source.positions.find(p=>p.id===r.id).state}));
const result={format:'atlas-root-branch-summary-v1',proof:{file:proofFile,sha256:digest(bytes)},scriptSha256:digest(await readFile('scripts/summarize-root-branches.mjs')),rows,rootCases,productionActive:false,warning:'Same-heuristic fixed-depth values, not solved game outcomes or causal proof of a match loss.'};
await writeFile(out,JSON.stringify(result,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(rootCases.map(({id,depth,overstatement,referenceGap})=>({id,depth,overstatement,referenceGap}))));
