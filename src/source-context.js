import {gridGeometry,pieceColor} from './screen-recognition.js';
const names=['청록','분홍'];
export function readStartingColor(image,rect,gap=.16){
 const grid=gridGeometry(rect,gap);
 function row(y){const votes=[0,0];for(let x=0;x<9;x++)for(const [u,v]of[[.2,.2],[.8,.2],[.2,.8],[.8,.8]]){const c=grid.cell(x,y),px=Math.floor(c.x+c.width*u),py=Math.floor(c.y+c.height*v),i=(py*image.width+px)*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];if(g-r>10&&b-r>7&&g>b*.8)votes[0]++;else if(r-g>12&&r-b>5)votes[1]++;}const t=votes[0]>votes[1]?0:1;return votes[t]>=24&&votes[1-t]<=4?t:null;}
 const bottom=row(8),top=row(0);return bottom!==null&&top===1-bottom?{bottom,reason:`아래 출발 줄 ${names[bottom]} · 위 출발 줄 ${names[top]}`}:{bottom:null,reason:'위·아래 출발 줄의 색을 확정하지 못했습니다.'};
}
export function normalizeGlyph(pixels,width,height,box,columns=10){
 const out=new Float32Array(columns*14);
 for(let y=0;y<14;y++)for(let x=0;x<columns;x++){let sum=0;for(const dy of [.25,.75])for(const dx of [.25,.75]){const px=Math.min(width-1,Math.floor(box.x+(x+dx)*box.width/columns)),py=Math.min(height-1,Math.floor(box.y+(y+dy)*box.height/14));sum+=pixels[py*width+px]?1:0;}out[y*columns+x]=sum/4;}return out;
}
export function createSourceTemplates(document){
 const canvas=document.createElement('canvas');canvas.width=128;canvas.height=40;const ctx=canvas.getContext('2d',{willReadFrequently:true}),templates={};
 for(const font of ['Arial','Segoe UI','Verdana'])for(const size of [7,8,9,10,11,12,14,16])for(const weight of [400,600])for(const char of [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789','MOVES','YOU','OPPONENT'])for(const spacing of char.length>1?[0,1,2]:[0]){
  ctx.clearRect(0,0,128,40);ctx.font=`${weight} ${size}px "${font}"`;ctx.letterSpacing=`${spacing}px`;ctx.fillStyle='#fff';ctx.fillText(char,3,25);const rgba=ctx.getImageData(0,0,128,40).data,mask=new Uint8Array(128*40);let x0=128,y0=40,x1=0,y1=0;
  for(let y=0;y<40;y++)for(let x=0;x<128;x++)if(rgba[(y*128+x)*4+3]>=100){mask[y*128+x]=1;x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  (templates[char]??=[]).push(normalizeGlyph(mask,128,40,{x:x0,y:y0,width:x1-x0+1,height:y1-y0+1},char.length>1?char.length*10:10));
 }return templates;
}
const textPixel=(r,g,b)=>Math.max(r,g,b)>90&&Math.max(r,g,b)-Math.min(r,g,b)<45||r>65&&g>45&&r>g*.85&&g>r*.5&&b<g*.9;
function textRows(image,rect){
 const {width:w,height:h,data}=image,step=rect.width/9,x0=Math.max(0,Math.floor(rect.x+rect.width+step*.12)),x1=Math.min(w,Math.ceil(rect.x+rect.width+rect.width*.85)),y0=Math.max(0,Math.floor(rect.y-step)),y1=Math.min(h,Math.ceil(rect.y+rect.height*.8));
 if(x1-x0<step||y1<=y0)return [];
 const width=x1-x0,height=y1-y0,mask=new Uint8Array(width*height),seen=new Uint8Array(mask.length),glyphs=[];
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=((y+y0)*w+x+x0)*4;mask[y*width+x]=data[i+3]>127&&textPixel(data[i],data[i+1],data[i+2])?1:0;}
 for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;const q=[i];seen[i]=1;let left=i%width,right=left,top=i/width|0,bottom=top;
  for(const n of q){const x=n%width,y=n/width|0;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);for(const [dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1]]){const xx=x+dx,yy=y+dy,j=yy*width+xx;if(xx>=0&&xx<width&&yy>=0&&yy<height&&mask[j]&&!seen[j]){seen[j]=1;q.push(j);}}}
  const gw=right-left+1,gh=bottom-top+1;if(gh<4||gh>Math.min(28,step*.55)||gw>gh*12||q.length<4)continue;
  glyphs.push({x:left+x0,y:top+y0,width:gw,height:gh,shape:normalizeGlyph(mask,width,height,{x:left,y:top,width:gw,height:gh}),cache:{}});
 }
 const rows=[];for(const glyph of glyphs.sort((a,b)=>a.y-b.y)){const center=glyph.y+glyph.height/2;let row=rows.find(r=>Math.abs(r.center-center)<Math.max(2,glyph.height*.28));if(!row)rows.push(row={center,glyphs:[]});row.glyphs.push(glyph);}return rows.map(r=>r.glyphs.sort((a,b)=>a.x-b.x));
}
function cost(glyph,char,templates){
 if(glyph.cache[char]!==undefined)return glyph.cache[char];let best=1;
 for(const ref of templates[char]??[]){let sum=0;for(let i=0;i<140;i++)sum+=Math.abs(ref[i]-glyph.shape[i]);best=Math.min(best,sum/140);}return glyph.cache[char]=best;
}
export function matchSourcePhrases(rows,templates,phrases){
 const matches=[];
 for(const row of rows)for(const text of phrases)for(let start=0;start+text.length<=row.length;start++){
  const part=row.slice(start,start+text.length),height=part.reduce((n,g)=>n+g.height,0)/part.length;
  if(part.some((g,i)=>g.width>g.height*1.6||Math.abs(g.height-height)>height*.35||i&&g.x-part[i-1].x-part[i-1].width>height*2))continue;
  const scores=part.map((g,i)=>cost(g,text[i],templates)),score=scores.reduce((a,b)=>a+b,0)/scores.length;
  if(score<=.19&&Math.max(...scores)<.38)matches.push({text,score,x:part[0].x,y:part[0].y,width:part.at(-1).x+part.at(-1).width-part[0].x,height,glyphs:part});
 }return matches.sort((a,b)=>a.score-b.score);
}
function wordHeaders(image,rows,templates,word){
 const matches=[];
 for(const row of rows){const groups=[];for(const g of row){const group=groups.at(-1),last=group?.at(-1);if(last&&g.x-last.x-last.width<g.height*.8)group.push(g);else groups.push([g]);}
  for(const group of groups){const x=group[0].x,y=Math.min(...group.map(g=>g.y)),width=group.at(-1).x+group.at(-1).width-x,height=Math.max(...group.map(g=>g.y+g.height))-y;if(width/height<word.length*.4||width/height>word.length*1.35)continue;
   const mask=new Uint8Array(width*height);for(let yy=0;yy<height;yy++)for(let xx=0;xx<width;xx++){const i=((y+yy)*image.width+x+xx)*4;mask[yy*width+xx]=textPixel(image.data[i],image.data[i+1],image.data[i+2])?1:0;}
   const shape=normalizeGlyph(mask,width,height,{x:0,y:0,width,height},word.length*10);let score=1;for(const ref of templates[word]??[]){let sum=0;for(let i=0;i<shape.length;i++)sum+=Math.abs(shape[i]-ref[i]);score=Math.min(score,sum/shape.length);}
   if(score<.14)matches.push({text:word,x,y,width,height,score,glyphs:group});
  }
 }return matches.sort((a,b)=>a.score-b.score);
}
function activeCardRoles(image,rect,rows,templates,diagnostic=[]){
 const step=rect.width/9,x0=Math.max(0,Math.floor(rect.x+rect.width+step*.12)),x1=Math.min(image.width,Math.ceil(rect.x+rect.width*1.85)),y0=Math.max(0,Math.floor(rect.y-step)),y1=Math.min(image.height,Math.ceil(rect.y+step*3.5)),w=x1-x0,h=y1-y0;if(w<1||h<1)return [];
 const mask=new Uint8Array(w*h),seen=new Uint8Array(w*h),roles=[];
 for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=((y+y0)*image.width+x+x0)*4,r=image.data[i],g=image.data[i+1],b=image.data[i+2];mask[y*w+x]=pieceColor(r,g,b)>=0||g>=50&&g-r>=18&&b-r>=12||r>=70&&r-g>=25&&r-b>=5?1:0;}
 const labels=['YOU','OPPONENT'].flatMap(word=>wordHeaders(image,rows,templates,word));
 for(let i=0;i<mask.length;i++){if(!mask[i]||seen[i])continue;const q=[i];seen[i]=1;let left=i%w,right=left,top=i/w|0,bottom=top;
  for(const n of q){const x=n%w,y=n/w|0;left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y);for(const [dx,dy]of[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1],[-1,1],[1,-1],[-2,0],[2,0],[0,-2],[0,2]]){const xx=x+dx,yy=y+dy,j=yy*w+xx;if(xx>=0&&xx<w&&yy>=0&&yy<h&&mask[j]&&!seen[j]){seen[j]=1;q.push(j);}}}
  const cw=right-left+1,ch=bottom-top+1;if(cw<step*2.2||ch<step*.5||ch>step*1.9)continue;
  function edge(horizontal,edge){let hits=0;for(let n=0;n<20;n++){const a=Math.round((horizontal?left:top)+(n/19*.7+.15)*(horizontal?cw:ch));let hit=false;for(let d=-2;d<=2;d++){const x=horizontal?a:edge+d,y=horizontal?edge+d:a;if(x>=0&&x<w&&y>=0&&y<h&&mask[y*w+x])hit=true;}if(hit)hits++;}return hits>=14;}
  const edges=[edge(true,top),edge(true,bottom),edge(false,left),edge(false,right)],inside=labels.filter(l=>l.x>=left+x0&&l.x+l.width<=right+x0&&l.y>=top+y0&&l.y+l.height<=bottom+y0),kinds=new Set(inside.map(l=>l.text==='YOU'?'self':'opponent'));
  diagnostic.push({x:left+x0,y:top+y0,width:cw,height:ch,edges,labels:inside.map(l=>({text:l.text,score:l.score}))});
  if(edges.some(e=>!e))continue;
  if(kinds.size===1)roles.push([...kinds][0]);
 }return roles;
}
export function readSourceContext(image,rect,{gap=.16,templates={}}={}){
 const side=readStartingColor(image,rect,gap),rows=textRows(image,rect),matches=matchSourcePhrases(rows,templates,['YOURTURN','OPPONENTSTURN']),cardCandidates=[],cards=activeCardRoles(image,rect,rows,templates,cardCandidates),roles=new Set([...matches.map(m=>m.text==='YOURTURN'?'self':'opponent'),...cards]);
 const relative=roles.size===1?[...roles][0]:null;
 const headers=wordHeaders(image,rows,templates,'MOVES');let moveCount=null,moveEvidence=[];
 if(headers.length){const header=headers[0],row=rows.find(r=>r.some(g=>g===header.glyphs[0])),digits=row.filter(g=>g.x>header.x+header.width+header.height&&g.x<rect.x+rect.width*1.85);
  if(digits.length>0&&digits.length<=3){const values=digits.map(g=>[...'0123456789'].map(c=>({c,score:cost(g,c,templates)})).sort((a,b)=>a.score-b.score));moveEvidence=values.map(v=>v.slice(0,2));if(values.every(v=>v[0].score<.16&&v[1].score-v[0].score>.015))moveCount=Number(values.map(v=>v[0].c).join(''));}
 }
 return {...side,relative,turn:relative!==null&&side.bottom!==null?(relative==='self'?side.bottom:1-side.bottom):null,moveCount,moveEvidence,diagnostic:{textRowCount:rows.length,cardCandidates,moveHeaders:headers.map(({x,y,score})=>({x,y,score}))},turnReason:roles.size>1?'차례 문구·활성 카드가 서로 충돌합니다.':relative===null?'차례 표시 판독 실패 · 카드가 포함된 공유인지 확인하고, 글씨가 작거나 테두리가 희미하면 확대 또는 수동 보정하세요.':`${relative==='self'?'내':'상대'} 차례 · ${matches.length?'원본 문구':'활성 카드'} 판독`,evidence:[...matches.map(({text,score,x,y})=>({text,score,x,y})),...cards.map(role=>({card:role}))]};
}
