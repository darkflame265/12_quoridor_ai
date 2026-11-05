import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {initial,apply,clone,legal,moves,validWall,distance} from '../src/engine.js';

const rng=seed=>{let n=seed>>>0;return()=>{n^=n<<13;n^=n>>>17;n^=n<<5;return (n>>>0)/4294967296;}};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const boardKey=s=>hash({p:s.p,walls:s.walls.map(w=>({x:w.x,y:w.y,o:w.o})).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),left:s.left,turn:s.turn});
const historicalFiles=['sigma4-value-development-positions-20261105.jsonl','sigma4-value-holdout-positions-20261105.jsonl'];
const previous=new Set(historicalFiles.flatMap(filename=>readFileSync('evaluation/'+filename,'utf8').trim().split('\n')
 .map(line=>boardKey(JSON.parse(line).state))));

const phases=[24,30,36,42];
const positions=[],seeds=[],existing=new Set();
for(let trial=0;trial<700&&positions.length<48;trial++){
 const seed=8300001+trial*1657,rand=rng(seed);
 let s=initial(),actions=[];
 const target=phases[trial%phases.length];
 for(let p=0;p<target&&s.winner===null;p++){
  const pawn=moves(s),walls=[];
  if(s.left[s.turn]>0){
   for(let tries=0;tries<28;tries++){
    const candidate={type:'wall',x:Math.floor(rand()*8),y:Math.floor(rand()*8),o:rand()<.5?'h':'v'};
    if(validWall(s,candidate))walls.push(candidate);
    if(walls.length>=9)break;
   }
  }
  const have=s.walls.length,wallProbability=have<6?.7:have<10?.54:have<15?.33:.14;
  const wantWall=walls.length&&rand()<wallProbability;
  const pawnChoices=pawn.map(a=>({a,d:distance(apply(s,a),s.turn)}));
  pawnChoices.sort((a,b)=>a.d-b.d);
  const safePawn=pawnChoices.filter(x=>apply(s,x.a).winner===null);
  let action;
  if(wantWall)action=walls[Math.floor(rand()*walls.length)];
  else if(safePawn.length){
   const selected=rand()<.7?safePawn.slice(0,Math.min(2,safePawn.length)):safePawn;
   action=selected[Math.floor(rand()*selected.length)].a;
  }else if(walls.length)action=walls[Math.floor(rand()*walls.length)];
  else break;
  assert(action&&legal(s,action));
  actions.push(action);s=apply(s,action);
 }
 if(actions.length!==target||s.winner!==null)continue;
 const wallCount=s.walls.length;
 if(wallCount<6||wallCount>19)continue;
 const positionId=boardKey(s);
 if(existing.has(positionId)||previous.has(positionId))continue;
 const split=positions.length%4===0?'holdout':'development';
 const record={id:'independent-wall-'+String(positions.length+1).padStart(3,'0'),
  groupId:'synthetic-seed-'+seed,seed,split,ply:actions.length,
  wallCount,turn:s.turn,ownDistance:distance(s,s.turn),enemyDistance:distance(s,1-s.turn),
  positionId,actions,state:clone(s),
  dataType:'Legal generated trajectory; NO observed winner label'};
 positions.push(record);seeds.push(seed);existing.add(positionId);
}
assert.equal(positions.length,48,'failed to generate 48 diverse positions');
assert.equal(positions.filter(x=>x.split==='holdout').length,12);
assert.equal(positions.filter(x=>x.split==='development').length,36);
assert(positions.some(x=>x.wallCount>=12));
const summary={version:'sigma4-unseen-wall-posbank-v1',generatedAt:'2026-11-05',
 count:positions.length,holdout:12,development:36,uniqueSeeds:new Set(seeds).size,
 uniqueBoardHashes:existing.size,overlapWithPriorScored:0,plyRange:[Math.min(...positions.map(x=>x.ply)),Math.max(...positions.map(x=>x.ply))],
 wallRange:[Math.min(...positions.map(x=>x.wallCount)),Math.max(...positions.map(x=>x.wallCount))],
 bins:Object.fromEntries(phases.map(p=>[p,positions.filter(x=>x.ply===p).length])),
 warning:'Independent synthetic legal trajectories are NOT independent completed game outcomes and do NOT supply minimax labels',
 promotionApproved:false};
writeFileSync('evaluation/sigma4-unseen-wall-positions-20261105.jsonl',positions.map(x=>JSON.stringify(x)).join('\n')+'\n');
writeFileSync('evaluation/sigma4-unseen-wall-positions-manifest-20261105.json',JSON.stringify(summary,null,2)+'\n');
console.log('PASS UNSEEN GENERATOR',JSON.stringify(summary));
