import{readFileSync,writeFileSync}from'node:fs';
import{clone,apply,legal,distance}from'../src/engine.js';
import{directWallThreat}from'./sigma3-wall-threat-probe.mjs';
const roots=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8'));
const ids=[101,103,105];
const out={version:'sigma3-wall-threat-reply-timeline-v1',method:'Replay fixed Sigma2 200-sim replies, calculate all legal next opponent walls at 0,2,4,...,14 plies',cases:[]};
for(const id of ids){
 const root=roots.find(x=>x.id===id);
 const detail=JSON.parse(readFileSync('evaluation/sigma3-fixture'+id+'-reply-depth16.json','utf8'));
 const branches=[];
 for(const branch of detail.branches){
  let s=apply(clone(root.s),branch.forcedAction);
  const points=[];
  for(let n=0;n<=14;n++){
   if(n%2===0){
    const threat=directWallThreat(s,root.s.turn,{topK:4});
    points.push({afterPlies:n,distanceMargin:distance(s,1-root.s.turn)-distance(s,root.s.turn),
      maxSingleWallDamage:threat.maxOwnIncrease,maxNetDamage:threat.maxNetDamage,
      damageWallCount:threat.legalDamageWalls,topWall:threat.candidates[0]?.action||null});
   }
   if(n<14){
    const reply=branch.replies[n];
    if(!legal(s,reply.chosen))throw Error('illegal replay '+id+' '+n);
    s=apply(s,reply.chosen);
   }
  }
  branches.push({choice:branch.choice,firstAction:branch.forcedAction,points,
    peakSingleDamage:Math.max(...points.map(p=>p.maxSingleWallDamage)),
    peakNetDamage:Math.max(...points.map(p=>p.maxNetDamage)),
    firstDangerAtOrAbove4:points.find(p=>p.maxSingleWallDamage>=4)?.afterPlies??null});
 }
 out.cases.push({id,branches});
}
writeFileSync('evaluation/sigma3-wall-threat-reply-timeline.json',JSON.stringify(out,null,2));
console.log(JSON.stringify(out.cases.map(x=>({id:x.id,branches:x.branches.map(b=>({choice:b.choice,
 maxDamages:b.points.map(p=>[p.afterPlies,p.maxSingleWallDamage,p.distanceMargin]),
 peak:b.peakSingleDamage,firstDanger:b.firstDangerAtOrAbove4}))})),null,2));
