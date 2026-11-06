import test from 'node:test';
import assert from 'node:assert/strict';
import {screenFixture} from '../fixtures/screen-board.mjs';
import {recognizeBoard} from '../../src/capture/screen-recognition.js';
import {detectBoards} from '../../src/capture/board-detection.js';
const palette=[[49,212,194],[250,115,147]];
function disk(f,p,r,color){
 const cx=24+p.x*58+24,cy=24+p.y*58+24;
 for(let y=Math.floor(cy-r);y<=cy+r;y++)for(let x=Math.floor(cx-r);x<=cx+r;x++)if((x-cx)**2+(y-cy)**2<=r*r)f.data.set([...color,255],(y*f.width+x)*4);
}
function reduced(f,scale){
 const width=Math.round(f.width*scale),height=Math.round(f.height*scale),data=new Uint8ClampedArray(width*height*4);
 for(let y=0;y<height;y++)for(let x=0;x<width;x++){const i=(Math.floor(y/scale)*f.width+Math.floor(x/scale))*4;data.set(f.data.subarray(i,i+4),(y*width+x)*4);}
 return {width,height,data};
}
test('opposite-colored avatar centers belong to the surrounding team contour at several scales',()=>{
 for(const owner of [0,1])for(const radius of [14,15])for(const scale of [1,.65,.55]){
  const f=screenFixture();disk(f,f.expected.p[owner],radius,palette[1-owner]);
  const image=reduced(f,scale),grids=detectBoards(image);assert.equal(grids.length,1);
  const r=recognizeBoard(image,grids[0].rect,{gap:grids[0].gap});
  assert.deepEqual(r.p,f.expected.p,`owner ${owner}, radius ${radius}, scale ${scale}`);
  assert.deepEqual(r.candidates.map(a=>a.length),[1,1]);assert.deepEqual(r.wallIssues,[]);
 }
});
test('subpixel-thin contours are either correctly recognized or left for manual correction',()=>{
 for(const owner of [0,1])for(const scale of [.65,.55]){
  const f=screenFixture();disk(f,f.expected.p[owner],16,palette[1-owner]);
  const image=reduced(f,scale),[grid]=detectBoards(image);assert.ok(grid);
  const r=recognizeBoard(image,grid.rect,{gap:grid.gap});
  for(const t of [0,1])if(r.p[t])assert.deepEqual(r.p[t],f.expected.p[t]);
 }
});
test('multiple real same-color pawns remain ambiguous without losing the detected grid',()=>{
 const f=screenFixture();disk(f,{x:1,y:1},17,palette[0]);
 const [grid]=detectBoards(f);assert.ok(grid);
 const r=recognizeBoard(f,grid.rect,{gap:grid.gap});assert.equal(r.p[0],null);
 assert.equal(r.candidates[0].length,2);assert.ok(r.notes.some(n=>n.includes('2')));
});
test('missing pawn retains the geometry and explains the missing candidate',()=>{
 const f=screenFixture();disk(f,f.expected.p[0],18,[41,38,30]);
 const [grid]=detectBoards(f);assert.ok(grid);
 const r=recognizeBoard(f,grid.rect,{gap:grid.gap});assert.equal(r.p[0],null);
 assert.equal(r.candidates[0].length,0);assert.ok(r.notes.some(n=>n.includes('0')));
});
