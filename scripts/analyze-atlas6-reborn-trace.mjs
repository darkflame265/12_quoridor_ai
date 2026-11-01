import {readFileSync} from 'node:fs';
import {distance,apply,legal} from '../src/engine.js';
const file=process.argv[2];
if(!file)throw Error('Usage: node scripts/analyze-atlas6-reborn-trace.mjs <trace.json>');
const d=JSON.parse(readFileSync(file,'utf8'));
const examined=d.trace.filter(x=>x.role==='atlas6').map(r=>{
 if(!legal(r.state,r.action))throw Error('Invalid trace action at '+r.ply);
 const next=apply(r.state,r.action);
 const own=r.side,enemy=1-own;
 const ownDelta=distance(next,own)-distance(r.state,own);
 const enemyDelta=distance(next,enemy)-distance(r.state,enemy);
 return {ply:r.ply,action:r.action,depth:r.depth,score:r.score,nodes:r.nodes,elapsedMs:r.elapsedMs,ownDelta,enemyDelta,tempoSwing:enemyDelta-ownDelta,wallSpent:r.state.left[own]-next.left[own]};
});
const suspects=examined.filter((r,i)=>r.wallSpent>0&&r.tempoSwing<=0 || i>0&&examined[i-1].score>150&&r.score< -150).map(r=>({...r,classification:'heuristic_suspect_not_proven'}));
console.log(JSON.stringify({fixture:d.fixture,verdict:d.verdict,engineBuild:d.engineBuild,opponentBuild:d.opponentBuild,atlasMoves:examined.length,suspects,notes:'Distance and search scores are diagnostic heuristics, never proofs of a losing move.'},null,2));
