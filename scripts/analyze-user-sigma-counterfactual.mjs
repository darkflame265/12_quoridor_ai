import {readFileSync,writeFileSync} from 'node:fs';
import {initial,apply,legal,candidates,distance,moves,validWall} from '../src/engine.js';
const base=JSON.parse(readFileSync('evaluation/sigma-userloss-main-replay.json','utf8'));
const targets=new Set([7,9,11,15,27]);
const all=s=>{const a=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))a.push(w);}return a;};
const metric=(s,t)=>({own:distance(s,t),opponent:distance(s,1-t),walls:[...s.left],winner:s.winner});
const safe=(s,t)=>{if(s.winner===t)return true;if(s.winner!==null)return false;return !moves(s).some(a=>a.y===(s.turn===0?0:8));};
let s=initial(),analysis=[];
for(const entry of base.decisions){
 if(targets.has(entry.ply)){
  const turn=s.turn;
  const alternatives=all(s).map(action=>{
   const next=apply(s,action);
   let bestReply=null;
   if(next.winner===null){const responses=all(next);
    let min=null;
    for(const response of responses){const final=apply(next,response);const d=distance(final,turn)-distance(final,1-turn);if(min===null||d>min.delta)min={action:response,delta:d,metric:metric(final,turn)};}
    bestReply=min;
   }
   return {action,metric:metric(next,turn),reply:bestReply,immediateThreat:safe(next,turn)};
  });
  const actual=alternatives.find(x=>x.action.type===entry.action.type&&x.action.x===entry.action.x&&x.action.y===entry.action.y&&x.action.o===entry.action.o);
  const sorted=alternatives.filter(x=>x.action.type==='move').sort((a,b)=>(a.reply?.delta??99)-(b.reply?.delta??99)).slice(0,5);
  analysis.push({ply:entry.ply,position:s,actual,alternatives:sorted,legalCandidates:alternatives.length});
 }
 if(!legal(s,entry.action))throw Error('Unexpected illegal ply '+entry.ply);
 s=apply(s,entry.action);
}
writeFileSync('evaluation/sigma-userloss-counterfactual.json',JSON.stringify({scope:'single-ply alternatives and opponent one-ply geometric reply, not proof of optimal play',analysis},null,2)+'\n');
console.log(JSON.stringify(analysis.map(x=>({ply:x.ply,actual:x.actual?.metric,bestPawn:x.alternatives[0]?.metric,bestPawnAction:x.alternatives[0]?.action,candidates:x.legalCandidates})),null,2));
