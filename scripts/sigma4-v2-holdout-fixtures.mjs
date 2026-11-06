import {initial,apply,legal,moves,validWall,distance} from '../src/engine.js';
import {writeFileSync} from 'node:fs';
const fixtures=[],seen=new Set(),sourceSeeds=[3011,3019,3037,3041,3061,3067,3079,3083,3089,3109,3121,3137,3163,3181,3203,3217,3229,3251,3271,3299];
function rng(seed){let s=seed>>>0;return()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};}
function options(s){
 const t=s.turn,own=distance(s,t),opp=distance(s,1-t);
 const actions=moves(s);
 if(s.left[t]>0){
  const pawn=s.p[1-t];
  for(let y=Math.max(0,pawn.y-2);y<=Math.min(7,pawn.y+1);y++)
   for(let x=Math.max(0,pawn.x-2);x<=Math.min(7,pawn.x+1);x++)
    for(const o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))actions.push(w);}
 }
 const scored=[];
 for(const action of actions){
  const next=apply(s,action);
  const ownDelta=own-distance(next,t),oppDelta=distance(next,1-t)-opp;
  const value=ownDelta*1.6+oppDelta*1.5-(action.type==='wall'?.25:0);
  if(action.type==='wall'&&oppDelta<=0)continue; if(action.type==='move'&&ownDelta<=0)continue;
  scored.push({action,value});
 }
 scored.sort((a,b)=>b.value-a.value||JSON.stringify(a.action).localeCompare(JSON.stringify(b.action)));
 return scored.slice(0,Math.max(5,Math.min(10,scored.length)));
}
for(const seed of sourceSeeds){
 const random=rng(seed),actions=[];let s=initial();
 for(let ply=0;ply<6;ply++){
  const opts=options(s);if(!opts.length)throw Error('empty fixture options');
  let selection;
  if(ply<2)selection=opts.find(x=>x.action.type==='move'&&x.action.x===4&&x.action.y===(ply===0?7:1))??opts[0];
  else{
   const wallsUsed=actions.filter(x=>x.type==='wall').length;
   const eligible=wallsUsed>=2?opts.filter(x=>x.action.type==='move'):opts;
   const pool=eligible.length?eligible:opts;
   const idx=Math.floor(Math.pow(random(),1.4)*Math.min(pool.length,7));
   selection=pool[idx];
  }
  if(!legal(s,selection.action))throw Error('illegal generated action');
  actions.push(selection.action);s=apply(s,selection.action);
 }
 const k=JSON.stringify(actions);
 if(seen.has(k))continue;
 seen.add(k);
 fixtures.push({id:'new-fixture-'+(fixtures.length+1),seed,actions,
  final:{turn:s.turn,walls:s.walls.length,distances:[distance(s,0),distance(s,1)]}});
 if(fixtures.length>=8)break;
}
if(fixtures.length<8)throw Error('insufficient distinct fixtures');
const out={version:'sigma4-v2-predeclared-independent-opening-fixtures-v1',
 generation:'fixed seeded six-ply quality-biased legal action sampler; no AI tournament outcomes inspected',
 fixtures,holdoutFromPreviousSix:true,locked:true};
writeFileSync('evaluation/sigma4-v2-holdout-fixtures.json',JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(fixtures.map(f=>({id:f.id,seed:f.seed,walls:f.final.walls,distances:f.final.distances,actions:f.actions})),null,2));
