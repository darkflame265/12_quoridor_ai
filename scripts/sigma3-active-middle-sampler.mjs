import{readFileSync,writeFileSync}from'node:fs';
import{legal,distance}from'../src/engine.js';
const origin=['sigma2-wallvalue-trial-24.json','sigma2-wallvalue-trial-24-seed2.json'];
const old=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const unseen=JSON.parse(readFileSync('evaluation/sigma3-unseen-middle-audited.json','utf8'));
const newholdout=JSON.parse(readFileSync('evaluation/sigma3-independent-middle-fixtures.json','utf8'));
const signature=s=>JSON.stringify([s.p,[...s.walls].sort((a,b)=>a.x-b.x||a.y-b.y||a.o.localeCompare(b.o)),s.left,s.turn]);
const excluded=new Set([...old,...unseen,...newholdout].map(f=>signature(f.s)));
let candidates=[];
for(const file of origin){
 const j=JSON.parse(readFileSync('reports/sigma-selfplay/'+file,'utf8'));
 for(const g of j.completed||[]){
  for(const step of g.trace||[]){
   const s=step.state,children=step.diagnostics?.rootChildren;
   if(!s||s.winner!==null||s.walls.length<6||s.walls.length>12||!children||children.length<2)continue;
   const [top,alt]=children;
   if(!top||!alt||!Number.isFinite(top.qFromRoot)||!Number.isFinite(alt.qFromRoot))continue;
   if(top.visits<30||alt.visits<15||alt.visits/top.visits<.20)continue;
   if(top.qFromRoot-alt.qFromRoot>.32)continue;
   if(Math.abs(distance(s,0)-distance(s,1))>6)continue;
   if(!legal(s,top.action)||!legal(s,alt.action))continue;
   if(excluded.has(signature(s)))continue;
   const score=(alt.visits/top.visits)-.6*Math.abs(top.qFromRoot-alt.qFromRoot)+
      .1*(top.action.type!==alt.action.type)+.01*Math.min(s.walls.length,10);
   candidates.push({file,sourceGame:g.index,ply:step.ply,score,s,phase:'middle',
     history:(g.trace||[]).filter(t=>t.ply<step.ply).slice(-48).map(t=>t.state),
     rootCandidates:children.slice(0,2)});
  }
 }
}
candidates.sort((a,b)=>b.score-a.score);
const selected=[],games=new Set();
for(const c of candidates){
 const id=c.file+'#'+c.sourceGame;
 if(games.has(id)||excluded.has(signature(c.s)))continue;
 selected.push({...c,id:200+selected.length});
 games.add(id);excluded.add(signature(c.s));
 if(selected.length>=8)break;
}
if(selected.length!==8)throw Error('Only '+selected.length+' usable active roots');
writeFileSync('evaluation/sigma3-active-middle-fixtures.json',JSON.stringify(selected,null,2));
console.log(JSON.stringify({candidateRoots:candidates.length,
 selections:selected.map(s=>({id:s.id,file:s.file,game:s.sourceGame,ply:s.ply,
  wallCount:s.s.walls.length,score:+s.score.toFixed(3),topVisits:s.rootCandidates[0].visits,altVisits:s.rootCandidates[1].visits,
  topQ:s.rootCandidates[0].qFromRoot,altQ:s.rootCandidates[1].qFromRoot}))},null,2));
