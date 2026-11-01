import {readFileSync} from 'node:fs';
import {convertState,chooseExternal} from './external-mcts-bridge.mjs';
import {moves,validWall,apply,initial,legal} from '../src/engine.js';
const fixed=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'));
let tested=0;
for(const fixture of fixed.slice(0,100)){
 const s=fixture.state,g=convertState(s);
 for(const a of moves(s)){
  const external=!!g.validNextPositions[a.y][a.x];
  if(!external)throw Error('pawn move mismatch '+fixture.id+' '+JSON.stringify(a));
 }
 for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){
  if(s.left[s.turn]===0)continue;
  const a={type:'wall',x,y,o};
  const original=validWall(s,a);
  const external=o==='h'?g.validNextWalls.horizontal[y][x]&&g.testIfExistPathsToGoalLinesAfterPlaceHorizontalWall(y,x):g.validNextWalls.vertical[y][x]&&g.testIfExistPathsToGoalLinesAfterPlaceVerticalWall(y,x);
  if(original!==external)throw Error('wall legality mismatch '+fixture.id+' '+JSON.stringify(a)+' '+original+' '+external);
 }
 tested++;
}
const a=chooseExternal(initial(),10);
if(!legal(initial(),a.pv[0]))throw Error('invalid opening');
console.log(JSON.stringify({testedStates:tested,opening:a,ok:true}));
