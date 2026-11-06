import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,distance} from '../src/engine.js';
const src=JSON.parse(readFileSync('evaluation/sigma4-diverse-strong-midgame-bank-20261106.json','utf8'));
assert.equal(src.attempts.length,32);
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const boardKey=s=>hash({p:s.p,walls:s.walls.map(w=>({x:w.x,y:w.y,o:w.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
const current=new Set(src.positions.map(x=>x.positionId)),prior=new Set(current);
for(const f of ['evaluation/sigma4-value-development-positions-20261105.jsonl','evaluation/sigma4-value-holdout-positions-20261105.jsonl','evaluation/sigma4-unseen-wall-positions-20261105.jsonl'])
 for(const ln of readFileSync(f,'utf8').trim().split('\n'))prior.add(boardKey(JSON.parse(ln).state));
for(const p of JSON.parse(readFileSync('evaluation/sigma4-strong-selfplay-midgames-20261106.json')).openings)prior.add(boardKey(p.board));
const odd=[];
for(const p of src.positions){
 let s=initial();
 for(const [i,a] of p.actions.slice(0,-1).entries()){
  assert(legal(s,a));s=apply(s,a);
 }
 assert.equal(p.ply%2,0);
 assert.equal(s.turn,1);
 const gap=distance(s,s.turn)-distance(s,1-s.turn),walls=s.walls.length;
 const boardHash=boardKey(s);
 if(Math.abs(gap)>2||walls<7||walls>17||prior.has(boardHash))continue;
 prior.add(boardHash);
 odd.push({id:p.id+'-odd',parentId:p.id,trajectoryGroup:p.seed,split:p.split,
  positionId:boardHash,ply:p.ply-1,wallCount:walls,pathGap:gap,
  board:clone(s),actions:p.actions.slice(0,-1),
  labelStatus:'correlated prior-ply snapshot; NOT an independent source group or training label'});
}
const out={version:'sigma4-strong-midgame-odd-perspective-audit-v1',
 sourceGroups:src.positions.length,evenSnapshots:src.positions.length,oddSnapshots:odd.length,
 oddDevelopment:odd.filter(x=>x.split==='development').length,
 oddHoldout:odd.filter(x=>x.split==='holdout').length,
 distinctOriginalSourceGroups:new Set(odd.map(x=>x.trajectoryGroup)).size,
 sourceTurnParityValidated:odd.every(x=>x.ply%2===1&&x.board.turn===1),
 allPathGapsAtMost2:odd.every(x=>Math.abs(x.pathGap)<=2),
 sourceSplitsPreserved:true,
 observations:odd,
 caveats:['Odd snapshot and even snapshot from the same trajectory are adjacent, highly correlated, not independent',
  'No model fitting or outcome labels were generated from these odd snapshots'],
 productionApproved:false};
writeFileSync('evaluation/sigma4-diverse-strong-odd-perspectives-20261106.json',JSON.stringify(out,null,2)+'\n');
console.log('PASS ODD PERSPECTIVE SOURCE AUDIT',JSON.stringify({even:out.evenSnapshots,odd:out.oddSnapshots,
 oddDevelopment:out.oddDevelopment,oddHoldout:out.oddHoldout,distinctGroups:out.distinctOriginalSourceGroups}));
