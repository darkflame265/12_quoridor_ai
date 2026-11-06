import {screenFixture} from './screen-board.mjs';
// Browser-only independent screen renderer: board, English source captions,
// two player cards and a MOVES counter. No production OCR templates are used.
export function paintSourceScreen(canvas,{bottom=0,relative='self',cardRole=relative,phrase=true,plies=12,font='Arial',size=11,positions,conflict=false,unknownSide=false,rounded=false,muted=false,labelSize=11,dots,dotOpacity,dotRadius,installed}={}){
 const f=screenFixture({bottom,positions:positions??(bottom===0?[{x:4,y:6},{x:4,y:2}]:[{x:4,y:2},{x:4,y:6}]),dots,dotOpacity,dotRadius,installed}),tile=document.createElement('canvas');tile.width=f.width;tile.height=f.height;tile.getContext('2d').putImageData(new ImageData(f.data,f.width,f.height),0,0);
 canvas.width=1000;canvas.height=760;const ctx=canvas.getContext('2d');ctx.fillStyle='#11130f';ctx.fillRect(0,0,1000,760);ctx.drawImage(tile,40,70);
 if(unknownSide){ctx.fillStyle='#29261e';ctx.fillRect(64,94,512,48);ctx.fillRect(64,558,512,48);}
 for(const [role,y,label]of[['opponent',90,'OPPONENT'],['self',210,'YOU']]){
  ctx.fillStyle='#1b1d17';ctx.fillRect(620,y,330,65);
  if(cardRole===role||conflict){ctx.strokeStyle=(role==='self'?bottom:1-bottom)===0?(muted?'#21594f':'#31d4c2'):(muted?'#834353':'#fa7393');ctx.lineWidth=rounded?1:2;if(rounded){ctx.beginPath();ctx.roundRect(620.5,y+.5,330,65,14);ctx.stroke();}else ctx.strokeRect(620,y,330,65);}
  ctx.fillStyle='#c5bea7';ctx.font=`600 ${labelSize}px ${font}`;ctx.fillText(label,640,y+25);
 }
 if(phrase){ctx.font=`400 ${size}px ${font}`;ctx.fillStyle='#b5aa7b';ctx.letterSpacing='1px';ctx.fillText(relative==='self'?'YOUR TURN':"OPPONENT'S TURN",690,185);ctx.letterSpacing='0px';}
 ctx.fillStyle='#b5aa7b';ctx.font=`400 11px ${font}`;ctx.fillText('MOVES',630,330);ctx.fillText(String(plies),920,330);
 return {rect:{x:64,y:94,width:512,height:512},gap:10/58};
}
