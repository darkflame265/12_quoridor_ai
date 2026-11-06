// Flat-color tile components vote for a repeated 9 x 9 lattice. No screen
// coordinates, page selectors or initial pawn positions are assumed.
export function detectBoards(image){
 const {width:w,height:h,data}=image,seen=new Uint8Array(w*h),queue=new Int32Array(w*h),tiles=[];
 const key=i=>{const p=i*4,r=data[p],g=data[p+1],b=data[p+2];return data[p+3]<128||Math.max(r,g,b)<28||Math.max(r,g,b)>145?-1:((r/12|0)*256+(g/12|0)*16+(b/12|0));};
 for(let i=0;i<w*h;i++){
  if(seen[i])continue;seen[i]=1;const color=key(i);if(color<0)continue;
  let head=0,tail=1,minX=i%w,maxX=minX,minY=i/w|0,maxY=minY;queue[0]=i;
  while(head<tail){const n=queue[head++],x=n%w,y=n/w|0;minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
   for(const j of [x? n-1:-1,x+1<w?n+1:-1,y?n-w:-1,y+1<h?n+w:-1])if(j>=0&&!seen[j]&&key(j)===color){seen[j]=1;queue[tail++]=j;}
  }
  const tw=maxX-minX+1,th=maxY-minY+1;
  if(tw>=12&&th>=12&&tw<Math.min(w,h)/7&&th<Math.min(w,h)/7&&tw/th>.65&&tw/th<1.5&&tail/(tw*th)>.52)tiles.push({x:(minX+maxX+1)/2,y:(minY+maxY+1)/2,w:tw,h:th});
 }
 const groups=[];
 for(const tile of tiles){let group=groups.find(g=>Math.abs(g[0].w-tile.w)<Math.max(3,tile.w*.1)&&Math.abs(g[0].h-tile.h)<Math.max(3,tile.h*.1));if(!group)groups.push(group=[]);group.push(tile);}
 const results=[];
 for(const group of groups){
  if(group.length<60)continue;
  const median=values=>values.sort((a,b)=>a-b)[values.length>>1],cw=median(group.map(t=>t.w)),ch=median(group.map(t=>t.h));
  function fits(axis,size){
   const clusters=[];for(const n of group.map(t=>t[axis]).sort((a,b)=>a-b)){const last=clusters.at(-1);if(last&&Math.abs(last.mean-n)<size*.07){last.sum+=n;last.count++;last.mean=last.sum/last.count;}else clusters.push({mean:n,sum:n,count:1});}
   const coords=clusters.filter(c=>c.count>=4).map(c=>c.mean),out=[];
   for(let a=0;a<coords.length;a++)for(let b=a+1;b<coords.length;b++)for(let span=1;span<=8;span++){
    const step=(coords[b]-coords[a])/span,gap=1-size/step;if(gap<.06||gap>.3)continue;
    const hits=Array.from({length:9},(_,i)=>coords.some(v=>Math.abs(v-coords[a]-i*step)<Math.max(2,step*.055))).filter(Boolean).length;
    if(hits===9&&!out.some(f=>Math.abs(f.start-coords[a])<2&&Math.abs(f.step-step)<1))out.push({start:coords[a],step,gap});
   }return out;
  }
  for(const x of fits('x',cw))for(const y of fits('y',ch)){
   const cells=new Set();let error=0;
   for(const t of group){const col=Math.round((t.x-x.start)/x.step),row=Math.round((t.y-y.start)/y.step),dx=Math.abs(t.x-x.start-col*x.step),dy=Math.abs(t.y-y.start-row*y.step);if(col>=0&&col<9&&row>=0&&row<9&&dx<x.step*.06&&dy<y.step*.06){cells.add(row*9+col);error+=dx/x.step+dy/y.step;}}
   if(cells.size<65)continue;
   const rect={x:x.start-cw/2,y:y.start-ch/2,width:8*x.step+cw,height:8*y.step+ch};
   if(rect.x<0||rect.y<0||rect.x+rect.width>w||rect.y+rect.height>h||Math.min(rect.width,rect.height)<180)continue;
   const score=cells.size-error;
   const old=results.find(r=>Math.abs(r.rect.x-rect.x)<cw&&Math.abs(r.rect.y-rect.y)<ch&&Math.abs(r.rect.width-rect.width)<cw);
   const candidate={rect,gap:{x:x.gap,y:y.gap},cells:cells.size,score};
   if(old){if(score>old.score)Object.assign(old,candidate);}else results.push(candidate);
  }
 }
 return results.sort((a,b)=>b.score-a.score);
}
export function trackedBoard(candidates,previous,width,height){
 if(candidates.length===1)return candidates[0];
 const sx=width/previous.width,sy=height/previous.height,p=previous.rect;
 const ranked=candidates.map(c=>({candidate:c,distance:Math.abs(c.rect.x-p.x*sx)/(p.width*sx)+Math.abs(c.rect.y-p.y*sy)/(p.height*sy)+Math.abs(Math.log(c.rect.width/(p.width*sx)))+Math.abs(Math.log(c.rect.height/(p.height*sy)))})).sort((a,b)=>a.distance-b.distance);
 return ranked[0]?.distance<.5&&ranked[1]?.distance-ranked[0].distance>.25?ranked[0].candidate:null;
}
// Evidence for retaining a previously confirmed geometry when a full scan
// loses tile components. Sample tile corners away from pawns and wall lanes.
export function gridFingerprint(image,geometry){
 const {rect,gap}=geometry,gx=typeof gap==='number'?gap:gap.x,gy=typeof gap==='number'?gap:gap.y,sx=rect.width/(9-gx),sy=rect.height/(9-gy),cw=sx*(1-gx),ch=sy*(1-gy),out=[];
 for(let y=0;y<9;y++)for(let x=0;x<9;x++)for(const [u,v] of [[.18,.18],[.82,.18],[.18,.82],[.82,.82]]){
  const px=Math.floor(rect.x+x*sx+cw*u),py=Math.floor(rect.y+y*sy+ch*v);if(px<0||py<0||px>=image.width||py>=image.height)return null;
  const i=(py*image.width+px)*4;out.push([image.data[i],image.data[i+1],image.data[i+2]]);
 }return out;
}
export function retainedGridMatches(image,previous){
 if(image.width!==previous.width||image.height!==previous.height||!previous.fingerprint)return false;
 const now=gridFingerprint(image,previous);return !!now&&now.filter((p,i)=>p.every((v,t)=>Math.abs(v-previous.fingerprint[i][t])<=16)).length/now.length>=.94;
}
