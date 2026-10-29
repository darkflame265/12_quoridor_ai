import test from 'node:test';
import assert from 'node:assert/strict';
import {detectBoards,trackedBoard} from './board-detection.js';
import {recognizeBoard} from './screen-recognition.js';
import {screenFixture} from '../scripts/test-fixtures/screen-board.mjs';
const keys=walls=>walls.map(w=>`${w.o}:${w.x}:${w.y}:${w.owner}`).sort();
// Nearest-neighbor placement into a larger desktop, with independent axes.
function desktop(f,{x=137,y=83,sx=.65,sy=.72,second=false}={}){
 const width=1200,height=950,data=new Uint8ClampedArray(width*height*4);for(let i=0;i<data.length;i+=4)data.set([16,18,14,255],i);
 function paste(dx,dy){for(let yy=0;yy<Math.round(f.height*sy);yy++)for(let xx=0;xx<Math.round(f.width*sx);xx++){const from=(Math.min(f.height-1,Math.floor(yy/sy))*f.width+Math.min(f.width-1,Math.floor(xx/sx)))*4;data.set(f.data.subarray(from,from+4),((dy+yy)*width+dx+xx)*4);}}paste(x,y);if(second)paste(700,120);
 return {width,height,data};
}
test('automatic lattice finds board in full desktop at different offsets, scales and independent axis gaps',()=>{
 for(const opts of [{},{x:60,y:200,sx:1,sy:.85},{x:300,y:100,sx:.45,sy:.55}]){
  const f=screenFixture(),image=desktop(f,opts),found=detectBoards(image);assert.equal(found.length,1);
  const r=recognizeBoard(image,found[0].rect,{gap:found[0].gap});assert.deepEqual(r.p,f.expected.p);assert.deepEqual(keys(r.walls),keys(f.expected.walls));
 }
});
test('five-wall regression reads both horizontal colors and all verticals with automatic geometry',()=>{
 const installed=[{x:1,y:1,o:'v',owner:1},{x:3,y:1,o:'h',owner:1},{x:6,y:3,o:'v',owner:0},{x:5,y:5,o:'v',owner:1},{x:2,y:5,o:'h',owner:0}].map(w=>({type:'wall',...w}));
 const f=screenFixture({installed,positions:[{x:4,y:4},{x:4,y:3}]}),image=desktop(f),[found]=detectBoards(image),r=recognizeBoard(image,found.rect,{gap:found.gap});assert.deepEqual(keys(r.walls),keys(installed));assert.deepEqual([0,1].map(t=>10-r.walls.filter(w=>w.owner===t).length),[8,7]);
});
test('horizontal and vertical wall recognition is symmetric under bitmap rotation',()=>{
 const f=screenFixture(),data=new Uint8ClampedArray(f.data.length);
 for(let y=0;y<f.height;y++)for(let x=0;x<f.width;x++){const from=(y*f.width+x)*4,to=(x*f.height+f.height-1-y)*4;data.set(f.data.subarray(from,from+4),to);}
 const image={width:f.height,height:f.width,data},[found]=detectBoards(image),r=recognizeBoard(image,found.rect,{gap:found.gap});
 assert.deepEqual(keys(r.walls),keys(f.expected.walls.map(w=>({...w,x:7-w.y,y:w.x,o:w.o==='h'?'v':'h'}))));
});
test('multiple boards remain distinct and empty or partial grids are not accepted',()=>{
 const f=screenFixture();assert.equal(detectBoards(desktop(f,{second:true})).length,2);
 const empty=desktop(f);empty.data.fill(0);assert.deepEqual(detectBoards(empty),[]);
 const partial=screenFixture();for(let y=0;y<partial.height;y++)for(let x=0;x<90;x++)partial.data.fill(0,(y*partial.width+x)*4,(y*partial.width+x)*4+4);assert.deepEqual(detectBoards(partial),[]);
});
test('tracking keeps selected board among multiple candidates and rejects ambiguous jumps',()=>{
 const candidates=detectBoards(desktop(screenFixture(),{second:true})),selected=candidates[0],previous={...selected,width:1200,height:950};
 assert.equal(trackedBoard(candidates,previous,1200,950),selected);
 assert.equal(trackedBoard([],previous,1200,950),null);
 assert.equal(trackedBoard([selected,{...selected,rect:{...selected.rect,x:selected.rect.x+1}}],previous,1200,950),null);
});
