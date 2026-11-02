import {readFileSync,writeFileSync} from 'node:fs';
import {apply,distance,legal,moves,validWall} from '../src/engine.js';
const games=JSON.parse(readFileSync('reports/sigma-selfplay/sigma2-valueguard20.json','utf8')).completed;
const identified=JSON.parse(readFileSync('evaluation/sigma2-decision-review.json','utf8')).rows;
const target=process.argv[2]??'evaluation/sigma2-multistep-hotspots.json';
const limit=Number(process.argv[3]??8);
const width=Number(process.argv[4]??4),depth=Number(process.argv[5]??4);
if(!Number.isInteger(depth)||depth<2||depth>10||!Number.isInteger(width)||width<2||width>5)throw Error('depth 2..10; width 2..5');
const legalActions=s=>{
 const a=moves(s);
 if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))a.push(w);}
 return a;
};
const metric=(s,side)=>s.winner!==null?(s.winner===side?10000:-10000):distance(s,1-side)-distance(s,side);
const rank=(s,side,maximize)=>{
 const scored=legalActions(s).map(a=>({a,next:apply(s,a)}));
 scored.sort((a,b)=>maximize?metric(b.next,side)-metric(a.next,side):metric(a.next,side)-metric(b.next,side));
 return scored.slice(0,width);
};
function mini(s,side,n,seen){
 if(s.winner!==null||n===0)return {score:metric(s,side),pv:[]};
 const key=JSON.stringify([s.p,s.walls,s.left,s.turn]);
 if(seen.has(key))return {score:-0.25,pv:[],cycle:true};
 const seenNext=new Set(seen);seenNext.add(key);
 const maximize=s.turn===side;
 let best=null;
 for(const {a,next} of rank(s,side,maximize)){
  const r=mini(next,side,n-1,seenNext);
  const v={score:r.score,pv:[a,...r.pv],cycle:r.cycle??false};
  if(best===null||(maximize?v.score>best.score:v.score<best.score))best=v;
 }
 return best??{score:metric(s,side),pv:[]};
}
const selected=[];
const unique=new Set();
for(const row of identified){
 if(row.gameWinner!=='sigma1'||row.regretProxy===null||row.regretProxy<2||!row.bestAlternative)continue;
 const sig=row.game+':'+JSON.stringify(row.action)+':'+JSON.stringify(row.bestAlternative.action);
 if(unique.has(sig))continue;unique.add(sig);selected.push(row);
 if(selected.length>=limit)break;
}
const results=[];
for(const row of selected){
 const g=games[row.game],turn=g.trace[row.ply-1],s=turn.state,side=turn.side;
 const lines=[];
 for(const [kind,a] of [['played',row.action],['alternative',row.bestAlternative.action]]){
  if(!legal(s,a))throw Error('invalid stored candidate at '+row.game+':'+row.ply);
  const v=mini(apply(s,a),side,depth-1,new Set());
  lines.push({kind,first:a,score:v.score,principalVariation:[a,...v.pv],cycle:v.cycle});
 }
 results.push({game:row.game,ply:row.ply,side,oneReplyRegret:row.regretProxy,lines,scoutDepth:depth,beamWidth:width,
  note:'Heuristic beam minimax; NOT exhaustive proof or full-engine continuation'});
 console.log('review',row.game,row.ply,lines.map(l=>l.kind+':'+l.score).join(' '));
}
writeFileSync(target,JSON.stringify({source:'sigma2-valueguard20',method:'beam minimax (bounded depth and width), wall-aware geometry',depth,width,cases:results},null,2)+'\n');
