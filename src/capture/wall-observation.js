const key=w=>`${w.o}:${w.x}:${w.y}:${w.owner}`;
const conflict=(a,b)=>a.o===b.o?(a.o==='h'?a.y===b.y&&Math.abs(a.x-b.x)<2:a.x===b.x&&Math.abs(a.y-b.y)<2):a.x===b.x&&a.y===b.y;
export function resolveObservedWalls(raw,known=[]){
 const candidates=[...new Map(raw.map(w=>[key(w),w])).values()],seen=new Set(),walls=[],issues=[];
 const locked=new Set(known.map(key));let work=0;
 for(let start=0;start<candidates.length;start++){
  if(seen.has(start))continue;const component=[start];seen.add(start);
  for(const i of component)for(let j=0;j<candidates.length;j++)if(!seen.has(j)&&conflict(candidates[i],candidates[j])){seen.add(j);component.push(j);}
  let best=[],count=-1,ambiguous=false,exhausted=false;
  function visit(at,chosen){
   if(++work>12000){exhausted=true;return;}
   if(chosen.length+component.length-at<count)return;
   if(at===component.length){if(chosen.length>count){best=[...chosen];count=chosen.length;ambiguous=false;}else if(chosen.length===count)ambiguous=true;return;}
   const w=candidates[component[at]];
   if(chosen.every(a=>!conflict(a,w)))visit(at+1,[...chosen,w]);
   if(!locked.has(key(w)))visit(at+1,chosen);
  }
  visit(0,[]);
  if(exhausted||count<0||ambiguous)issues.push('연결된 벽 후보의 위치를 유일하게 구분하지 못했습니다. 벽 보정 또는 현재 화면 재동기화가 필요합니다.');
  else walls.push(...best);
 }
 return {walls,issues,rawCount:raw.length};
}
