import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,legal,distance} from '../src/engine.js';
const p='evaluation/sigma4-diverse-strong-midgame-bank-20261106.json';
const d=JSON.parse(readFileSync(p,'utf8'));
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const canon=s=>sha({p:s.p,walls:s.walls.map(w=>({x:w.x,y:w.y,o:w.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
assert.equal(d.settings.attempts,32);
assert.equal(d.attempts.length,32);
const historical=new Set();
for(const f of ['evaluation/sigma4-value-development-positions-20261105.jsonl','evaluation/sigma4-value-holdout-positions-20261105.jsonl','evaluation/sigma4-unseen-wall-positions-20261105.jsonl'])
 for(const line of readFileSync(f,'utf8').trim().split('\n')){
  const x=JSON.parse(line);historical.add(canon(x.state));
 }
for(const x of JSON.parse(readFileSync('evaluation/sigma4-strong-selfplay-midgames-20261106.json','utf8')).openings)historical.add(canon(x.board));
const positions=new Set(),prefixes=new Set(),styles={};
for(const r of d.positions){
 const attempt=d.attempts[r.attempt];
 assert(attempt.accepted&&attempt.seed===r.seed);
 assert(!positions.has(r.positionId));
 assert(!historical.has(r.positionId));
 positions.add(r.positionId);
 const prefix=sha(r.actions);
 assert(!prefixes.has(prefix));prefixes.add(prefix);
 assert(['weighted-base','native-sigma3','constrained-mcts-alternative'].includes(r.sourceStyle));
 styles[r.sourceStyle]=(styles[r.sourceStyle]??0)+1;
 assert.equal(r.split,r.attempt%4===0?'holdout':'development');
 assert(r.wallCount>=7&&r.wallCount<=17);
 assert(Math.abs(r.pathGap)<=2);
 assert([20,24,28,32].includes(r.ply));
 let s=initial();
 for(const [i,a] of r.actions.entries()){assert(legal(s,a),'illegal '+r.id+' '+i);s=apply(s,a);}
 assert.equal(s.winner,null);
 assert.deepEqual(s,r.board);
 assert.equal(r.ply,r.actions.length);
 assert.equal(r.wallCount,s.walls.length);
 assert.equal(r.pathGap,distance(s,s.turn)-distance(s,1-s.turn));
 assert.equal(canon(s),r.positionId);
}
const out={version:'sigma4-diverse-strong-midgame-audit-v1',attempts:d.attempts.length,
 uniqueSourcePositions:d.positions.length,distinctSeeds:new Set(d.positions.map(x=>x.seed)).size,
 priorDatasetBoardOverlaps:0,
 pathGapMin:Math.min(...d.positions.map(x=>x.pathGap)),
 pathGapMax:Math.max(...d.positions.map(x=>x.pathGap)),
 wallCountMin:Math.min(...d.positions.map(x=>x.wallCount)),
 wallCountMax:Math.max(...d.positions.map(x=>x.wallCount)),
 bySourcePolicy:styles,
 development:d.positions.filter(x=>x.split==='development').length,
 holdout:d.positions.filter(x=>x.split==='holdout').length,
 verifiedLegal:true,
 warnings:['Distinct starting trajectories share the same source network and may still be correlated in early-game decisions',
 'MCTS-supported alternative root selection diversifies game sources, but does not prove optimality',
 'Accepted positions are unlabeled until independent policy continuations are completed'],
 trainingApproved:false,productionApproved:false};
writeFileSync('evaluation/sigma4-diverse-strong-midgame-audit-20261106.json',JSON.stringify(out,null,2)+'\n');
console.log('PASS DIVERSE SOURCE AUDIT',JSON.stringify(out));
