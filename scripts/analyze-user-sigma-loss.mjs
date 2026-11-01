import {initial,legal,apply,distance} from '../src/engine.js';
import {writeFileSync} from 'node:fs';
// Exact 41 actions of the uploaded screen-linked main segment, retained
// independently of other rebased capture segments.
const tokens=`m4,7 m4,1 m4,6 m4,2 m4,5 m4,3 h0,6 h4,2 h2,6 v4,6 v4,3 v3,3 m3,5 h2,4 v3,5 h5,4 m2,5 m4,4 m1,5 v5,5 m1,4 h1,3 h4,7 m4,5 m0,4 h0,2 h6,7 v5,7 h2,7 m4,6 m1,4 m4,7 m2,4 v2,3 m1,4 m3,7 m0,4 m2,7 m0,3 m1,7 m1,3`.split(' ');
let s=initial();const decisions=[];let firstInvalid=null;
for(let i=0;i<tokens.length;i++){
 const t=tokens[i],a=t[0]==='m'?{type:'move',x:+t[1],y:+t[3]}:{type:'wall',o:t[0],x:+t[1],y:+t[3]};
 if(!legal(s,a)){firstInvalid={ply:i+1,action:a,state:s};break;}
 const before=[distance(s,0),distance(s,1)],next=apply(s,a),after=[distance(next,0),distance(next,1)];
 decisions.push({ply:i+1,side:s.turn,action:a,before,after,remainingWalls:next.left});s=next;
}
const report={source:'uploaded quoridor-game (13).json main 41-action segment',count:tokens.length,replayed:decisions.length,firstInvalid,final:s,decisions,criticalWalls:decisions.filter(x=>x.side===0&&x.action.type==='wall'&&(x.after[1]-x.before[1])-(x.after[0]-x.before[0])<=0)};
writeFileSync('evaluation/sigma-userloss-main-replay.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({replayed:decisions.length,firstInvalid,final:s,criticalWalls:report.criticalWalls.map(x=>({ply:x.ply,action:x.action,before:x.before,after:x.after}))},null,2));
