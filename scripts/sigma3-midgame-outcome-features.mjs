import{readFileSync,writeFileSync}from'node:fs';
import{distance,clone,apply,legal}from'../src/engine.js';
const f=JSON.parse(readFileSync('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const j=JSON.parse(readFileSync('evaluation/sigma3-midgame-outcome-rollouts.json','utf8'));
const groups=new Map();
for(const r of j.results){
 const k=r.id+':'+r.choice;
 if(!groups.has(k))groups.set(k,[]);
 groups.get(k).push(r);
}
const rows=[];
for(const [key,arr]of groups){
 const r=arr[0],s=f[r.id].s,a=r.action;
 if(!legal(s,a))throw Error('Illegal '+key);
 const next=apply(clone(s),a),me=s.turn,opp=1-me;
 const features=[1,r.rootQ??0,Math.log1p(r.visits)/6,
 distance(s,me)-distance(next,me),
 distance(next,opp)-distance(s,opp),
 s.left[me]/10,s.left[opp]/10,+(a.type==='wall'),Math.min(1,r.ply/100)];
 rows.push({id:r.id,choice:r.choice,action:a,features,results:arr.map(x=>({seed:x.seed,win:x.rootWin,cutoff:x.cutoff,plies:x.continuationPlies}))});
}
writeFileSync('evaluation/sigma3-midgame-outcome-features.json',JSON.stringify({version:'v1',features:['bias','rootQ','logVisits','ownDistanceReduction','enemyDistanceIncrease','ownWalls','enemyWalls','wallAction','plyFraction'],rows},null,2));
console.log('rows',rows.length,'groups',new Set(rows.map(r=>r.id)).size);
