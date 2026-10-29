// Independent bitmap fixture: 48 px tiles, 10 px lanes; the reader is given
// only the finished pixels and crop. Coordinates here are expected answers.
export function screenFixture({ring=false,scale=1,bottom=0,positions,installed}={}){
 const size=512,pad=24,width=(size+pad*2)*scale,height=width,data=new Uint8ClampedArray(width*height*4),step=58;
 const palette=[[49,212,194],[250,115,147]],p=positions??[{x:4,y:6},{x:4,y:2}],walls=installed??[{type:'wall',x:1,y:3,o:'h',owner:0},{type:'wall',x:3,y:3,o:'h',owner:0},{type:'wall',x:5,y:4,o:'v',owner:1}];
 function pixel(x,y,c){for(let yy=0;yy<scale;yy++)for(let xx=0;xx<scale;xx++){const i=((y*scale+yy)*width+x*scale+xx)*4;data.set([...c,255],i);}}
 function rect(x,y,w,h,c){for(let yy=Math.floor(y);yy<Math.ceil(y+h);yy++)for(let xx=Math.floor(x);xx<Math.ceil(x+w);xx++)pixel(xx,yy,c);}
 function disk(cx,cy,r,c){for(let y=Math.floor(cy-r);y<=Math.ceil(cy+r);y++)for(let x=Math.floor(cx-r);x<=Math.ceil(cx+r);x++)if((x-cx)**2+(y-cy)**2<=r*r)pixel(x,y,c);}
 rect(0,0,size+pad*2,size+pad*2,[17,19,15]);
 for(let y=0;y<9;y++)for(let x=0;x<9;x++)rect(pad+x*step,pad+y*step,48,48,y===0?(bottom===0?[90,52,58]:[30,75,70]):y===8?(bottom===0?[30,75,70]:[90,52,58]):[41,38,30]);
 // Legal move dots and a neutral hover wall must not become pieces/walls.
 for(const [x,y]of[[3,6],[5,6],[4,5]])disk(pad+x*step+24,pad+y*step+24,6,palette[0]);
 rect(pad+6*step,pad+1*step+50,106,6,[170,169,160]);
 for(const w of walls){const x=pad+w.x*step,y=pad+w.y*step;if(w.o==='h')rect(x,y+50,106,6,palette[w.owner]);else rect(x+50,y,6,106,palette[w.owner]);}
 for(let t=0;t<2;t++){const c=p[t];disk(pad+c.x*step+24,pad+c.y*step+24,17,palette[t]);if(ring)disk(pad+c.x*step+24,pad+c.y*step+24,14,[20,20,18]);}
 return {width,height,data,crop:{x:pad*scale,y:pad*scale,width:size*scale,height:size*scale},gap:10/58,expected:{p,walls,left:[0,1].map(t=>10-walls.filter(w=>w.owner===t).length),turn:1,winner:null}};
}
