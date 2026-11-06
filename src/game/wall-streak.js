import {distance,moves,apply} from './engine.js';
// Counts only observed actions; imported snapshots cannot reveal earlier play.
export function wallStreak(records,turn,baseTurn=0){
 let count=0;
 for(let i=records.length-1;i>=0;i--){
  if(((baseTurn+i)%2)!==turn)continue;
  if(records[i].type!=='wall')break;
  count++;if(count===10)break;
 }
 return count;
}
export function wallRun(records,past,turn,baseTurn=0){
 const run=[];
 for(let i=records.length-1;i>=0;i--){
  if(((baseTurn+i)%2)!==turn)continue;
  const action=records[i];if(action.type!=='wall')break;
  const before=past[i]?.turn===turn?past[i]:null;
  const moveProgress=before?Math.max(0,...moves(before).map(a=>distance(before,turn)-distance(apply(before,a),turn))):0;
  run.unshift({...action,moveProgress});if(run.length===10)break;
 }
 return run;
}
