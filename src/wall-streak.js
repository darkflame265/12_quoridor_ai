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
