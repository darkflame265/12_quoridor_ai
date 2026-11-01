import {readFileSync} from 'node:fs';
const file=process.argv[2];
if(!file)throw Error('Usage: node scripts/analyze-atlas6-reborn-roots.mjs <trace.json>');
const d=JSON.parse(readFileSync(file,'utf8'));
const rows=d.trace.filter(r=>r.role==='atlas6').map(r=>{
 const z=r.rootDiagnostics;
 if(!z)return r.exact?{ply:r.ply,exactOracle:true,score:r.score}:{ply:r.ply,error:'missing-root-diagnostics'};
 const index=z.orderedActions.findIndex(a=>JSON.stringify(a)===JSON.stringify(r.action));
 const scoring=z.scores.filter(x=>x!==null);
 return {ply:r.ply,depth:r.depth,totalCandidates:z.orderedActions.length,scoredCandidates:scoring.length,chosenInRoot:index>=0,chosenScore:index>=0?z.scores[index]:null,searchScore:r.score,scoreSpread:scoring.length?Math.max(...scoring)-Math.min(...scoring):null};
});
const exceptions=rows.filter(r=>r.error||r.chosenInRoot===false||r.scoredCandidates!==undefined&&r.scoredCandidates<r.totalCandidates);
console.log(JSON.stringify({fixture:d.fixture,verdict:d.verdict,positions:rows.length,exceptions,first:rows.slice(0,6),caution:'PVS scout values include bounds; candidate scores are not comparable exact minimax scores.'},null,2));
