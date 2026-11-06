// Color/geometry reader for the dark teal/pink board theme. No DOM, network,
// text OCR, turn inference or probability claims. Every result is a draft.
import {resolveObservedWalls} from './wall-observation.js';
export function pieceColor(r,g,b){
 if(g>=110&&g-r>=35&&b-r>=25&&b>=g*.65&&g>=b*.85)return 0;
 if(r>=135&&r-g>=45&&r-b>=10&&b>=g*.7)return 1;
 return -1;
}
export function gridGeometry(rect,gap=.16){
 const gx=typeof gap==='number'?gap:gap?.x,gy=typeof gap==='number'?gap:gap?.y;
 if(!rect||![rect.x,rect.y,rect.width,rect.height,gx,gy].every(Number.isFinite)||rect.width<90||rect.height<90||gx<.06||gx>.3||gy<.06||gy>.3)throw Error('보드 영역과 간격을 확인하세요.');
 const sx=rect.width/(9-gx),sy=rect.height/(9-gy),cw=sx*(1-gx),ch=sy*(1-gy);
 return {sx,sy,cw,ch,cell:(x,y)=>({x:rect.x+x*sx,y:rect.y+y*sy,width:cw,height:ch}),center:(x,y)=>({x:rect.x+x*sx+cw/2,y:rect.y+y*sy+ch/2}),joint:(x,y)=>({x:rect.x+(x+1)*sx-sx*gx/2,y:rect.y+(y+1)*sy-sy*gy/2})};
}
function sample(image,cx,cy,rx,ry){
 const counts=[0,0],bounds=[[Infinity,Infinity,-Infinity,-Infinity],[Infinity,Infinity,-Infinity,-Infinity]];let total=0;
 for(let y=Math.max(0,Math.floor(cy-ry));y<=Math.min(image.height-1,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<=Math.min(image.width-1,Math.ceil(cx+rx));x++){
  const i=(y*image.width+x)*4,t=image.data[i+3]<128?-1:pieceColor(image.data[i],image.data[i+1],image.data[i+2]);total++;
  if(t>=0){counts[t]++;const b=bounds[t];b[0]=Math.min(b[0],x);b[1]=Math.min(b[1],y);b[2]=Math.max(b[2],x);b[3]=Math.max(b[3],y);}
 }return {counts,bounds,total};
}
// Hints may be much dimmer than pawns, especially on a tinted goal row.
// Compare against the local tile background and require a centered small disk.
export function readMoveDots(image,rect,{gap=.16,pawns=[]}={}){
 const grid=gridGeometry(rect,gap),dots=[];
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){
  if(pawns.some(p=>p&&p.x===x&&p.y===y))continue;
  const cell=grid.cell(x,y),center=grid.center(x,y),background=[0,0,0];
  for(const [u,v]of[[.18,.18],[.82,.18],[.18,.82],[.82,.82]]){const i=(Math.floor(cell.y+cell.height*v)*image.width+Math.floor(cell.x+cell.width*u))*4;for(let t=0;t<3;t++)background[t]+=image.data[i+t]/4;}
  const stats=[0,1].map(()=>({count:0,left:Infinity,right:-Infinity,top:Infinity,bottom:-Infinity}));
  for(let py=Math.max(0,Math.floor(center.y-cell.height*.34));py<=Math.min(image.height-1,Math.ceil(center.y+cell.height*.34));py++)for(let px=Math.max(0,Math.floor(center.x-cell.width*.34));px<=Math.min(image.width-1,Math.ceil(center.x+cell.width*.34));px++){
   const i=(py*image.width+px)*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];if(image.data[i+3]<128)continue;
   const owner=g>=60&&g-r>=18&&b-r>=14&&b>=g*.65&&Math.max(g-background[1],b-background[2])>=16?0:r>=75&&r-g>=25&&r-b>=10&&r-background[0]>=18?1:-1;
   if(owner<0)continue;const s=stats[owner];s.count++;s.left=Math.min(s.left,px);s.right=Math.max(s.right,px);s.top=Math.min(s.top,py);s.bottom=Math.max(s.bottom,py);
  }
  for(const owner of [0,1]){const s=stats[owner],w=s.right-s.left+1,h=s.bottom-s.top+1;if(s.count>=4&&w>=grid.sx*.07&&h>=grid.sy*.07&&w<=grid.sx*.34&&h<=grid.sy*.34&&w/h>=.65&&w/h<=1.5&&s.count/(w*h)>=.5&&s.count/(w*h)<=.9&&Math.abs((s.left+s.right)/2-center.x)<grid.sx*.1&&Math.abs((s.top+s.bottom)/2-center.y)<grid.sy*.1)dots.push({x,y,owner});}
 }
 return dots;
}
// Prefer the outermost colored contour over a multicolored avatar center.
// Small move dots and straight wall strips cannot surround the cell center.
function contourOwner(image,center,cw,ch){
 const votes=[0,0];
 for(let i=0;i<24;i++){
  const angle=i*Math.PI/12;
  for(let radius=.42;radius>=.26;radius-=.01){
   const x=Math.round(center.x+Math.cos(angle)*cw*radius),y=Math.round(center.y+Math.sin(angle)*ch*radius);
   if(x<0||y<0||x>=image.width||y>=image.height)continue;
   const k=(y*image.width+x)*4;
   const owner=image.data[k+3]<128?-1:pieceColor(image.data[k],image.data[k+1],image.data[k+2]);
   if(owner>=0){votes[owner]++;break;}
  }
 }
 return votes[0]>=18?0:votes[1]>=18?1:-1;
}
export function recognizeBoard(image,rect,{gap=.16,knownWalls=[]}={}){
 if(!image||!Number.isInteger(image.width)||!Number.isInteger(image.height)||!image.data||image.data.length!==image.width*image.height*4)throw Error('이미지 픽셀을 읽을 수 없습니다.');
 const grid=gridGeometry(rect,gap);
 if(rect.x<0||rect.y<0||rect.x+rect.width>image.width||rect.y+rect.height>image.height)throw Error('보드 영역이 이미지 밖에 있습니다.');
 const candidates=[[],[]],walls=[];
 for(let y=0;y<9;y++)for(let x=0;x<9;x++){
  const c=grid.center(x,y),s=sample(image,c.x,c.y,grid.cw*.4,grid.ch*.4);
  const outline=contourOwner(image,c,grid.cw,grid.ch);
  if(outline>=0)candidates[outline].push({x,y});
  else for(const t of [0,1]){const b=s.bounds[t];if(s.counts[t]>=s.total*.08&&b[2]-b[0]>=grid.sx*.42&&b[3]-b[1]>=grid.sy*.42)candidates[t].push({x,y});}
 }
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  const c=grid.joint(x,y),first=grid.center(x,y),second=grid.center(x+1,y+1);
  // Scan a narrow band around the lane center. Requiring all three segments
  // on the SAME raster line tolerates rounding without joining separate walls.
  const horizontal=o==='h',center=horizontal?c.y:c.x,range=Math.max(1,Math.min(horizontal?grid.sy-grid.ch:grid.sx-grid.cw,(horizontal?grid.sy:grid.sx)*.11)/2),owners=new Set();
  for(let line=Math.round(center-range);line<=Math.round(center+range);line++){
   const samples=horizontal?[sample(image,first.x,line,grid.sx*.14,0),sample(image,c.x,line,grid.sx*.025,0),sample(image,second.x,line,grid.sx*.14,0)]:[sample(image,line,first.y,0,grid.sy*.14),sample(image,line,c.y,0,grid.sy*.025),sample(image,line,second.y,0,grid.sy*.14)];
   for(const owner of [0,1])if(samples.every(s=>s.total>0&&s.counts[owner]/s.total>=.65))owners.add(owner);
  }
  if(owners.size===1)walls.push({type:'wall',x,y,o,owner:[...owners][0]});
 }
 const notes=candidates.flatMap((list,t)=>list.length===1?[]:[`${t===0?'청록':'분홍'} 말 후보 ${list.length}개: 검토 보드에서 위치를 지정하세요.`]);
 const resolved=resolveObservedWalls(walls,knownWalls);
 const p=candidates.map(list=>list.length===1?list[0]:null),dots=readMoveDots(image,rect,{gap,pawns:candidates.flat()});
 return {p,dots,walls:resolved.walls,candidates,notes:[...notes,...resolved.issues],wallIssues:resolved.issues,rawWallCount:resolved.rawCount};
}
