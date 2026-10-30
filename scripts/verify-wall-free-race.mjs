import fs from 'node:fs';
import path from 'node:path';
import {apply,legal,moves,notation} from '../src/engine.js';
import {solveEndgame,decode} from '../src/search.js';
import {solveOneEnemyWall} from '../evaluation/one-wall-oracle.mjs';
const [input,output='reports/wall-free-race.json']=process.argv.slice(2);
if(!input)throw Error('Usage: node scripts/verify-wall-free-race.mjs game.json output.json');
const game=JSON.parse(fs.readFileSync(input,'utf8')),target=game.side,results=[];
const tables=new Map();
const oneWallTables=new Map();
function delayedWall(s){
 const key=JSON.stringify([target,s.left[1-target]>0,s.walls.map(w=>[w.x,w.y,w.o]).sort()]);
 let table=oneWallTables.get(key);if(!table){table=solveOneEnemyWall(s,target);oneWallTables.set(key,table);if(oneWallTables.size>4)oneWallTables.delete(oneWallTables.keys().next().value);}
 const r=table.lookup(s.p[0].y*9+s.p[0].x,s.p[1].y*9+s.p[1].x,s.turn);
 return s.turn===target?r:-r;
}
function fixed(s){
 const key=JSON.stringify(s.walls.map(w=>[w.x,w.y,w.o]).sort());
 let table=tables.get(key);if(!table){table=solveEndgame({...s,left:[0,0]});tables.set(key,table);if(tables.size>100)tables.delete(tables.keys().next().value);}
 return table.lookup(s.p[0].y*9+s.p[0].x,s.p[1].y*9+s.p[1].x,s.turn);
}
function opponentChoices(s){
 if(s.winner!==null)return [];
 const choices=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const a={type:'wall',x,y,o};if(legal(s,a))choices.push(a);}
 return choices;
}
let state=game.baseState;
for(let i=0;i<game.records.length;i++){
 if(state.turn===target&&[37,39,41,47,49,51].includes(i+1)){
  const actions=state.left[target]===0?moves(state):[game.records[i]];
  const rows=[];
  for(const action of actions){
   const child=apply(state,action);
   if(child.left[target]!==0)continue;
   const variants=opponentChoices(child).map(reply=>{
    const next=apply(child,reply),r=fixed(next);
    return {reply:notation(reply),action:reply,targetOutcome:r.outcome,plies:r.distance,targetMove:r.move>=0?decode(r.move):null};
   });
   const losses=variants.filter(r=>r.targetOutcome===-1),noWalls=fixed(child);
   rows.push({action:notation(action),rawAction:action,actual:notation(action)===notation(game.records[i]),opponentReplies:variants.length,losingReplies:losses.length,
    lossProven:losses.length>0,certificate:losses[0]??null,noFurtherWallOutcomeForTarget:-noWalls.outcome,oneWallAtAnyTurnOutcomeForTarget:delayedWall(child),variants});
  }
  results.push({ply:i+1,rows});
  console.log(JSON.stringify({ply:i+1,rows:rows.map(({variants,...r})=>r)}));
 }
 state=apply(state,game.records[i]);
}
fs.mkdirSync(path.dirname(output),{recursive:true});
fs.writeFileSync(output,JSON.stringify({target,input:input.split(/[\\/]/).at(-1),method:'Target has zero walls. Immediate replies are followed by exact fixed-maze play. The separate one-wall retrograde oracle allows the enemy at most one wall at ANY future turn. Either target loss is a sound full-game loss witness; neither target win is a full-game win proof when the enemy has more walls.',results},null,2));
