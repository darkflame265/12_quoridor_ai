import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {legal} from '../src/engine.js';
const src=new URL('../vendor/gorisanson-quoridor-ai/',import.meta.url);
const context=vm.createContext({Math,Date,console:{log(){},warn(){},error(){}}});
vm.runInContext(readFileSync(new URL('game.js',src),'utf8')+'\n'+readFileSync(new URL('ai.js',src),'utf8')+'\nthis.BridgeGame=Game;this.BridgeAI=AI;',context);
export function convertState(s){
 const g=new context.BridgeGame(true);
 for(const w of s.walls){
  g.turn=w.owner??0;
  const m=w.o==='h'?[null,[w.y,w.x],null]:[null,null,[w.y,w.x]];
  if(!g.doMove(m,false))throw Error('External engine wall reconstruction failed '+JSON.stringify(w));
 }
 for(let p=0;p<2;p++){
  g.board.pawns[p].position.row=s.p[p].y;
  g.board.pawns[p].position.col=s.p[p].x;
  g.board.pawns[p].numberOfLeftWalls=s.left[p];
 }
 g.turn=s.turn;g.winner=null;
 g._validNextPositionsUpdated=false;g._probableValidNextWallsUpdated=false;
 return g;
}
export function convertMove(m){
 return m[0]?{type:'move',x:m[0][1],y:m[0][0]}:m[1]?{type:'wall',o:'h',x:m[1][1],y:m[1][0]}:{type:'wall',o:'v',x:m[2][1],y:m[2][0]};
}
export function chooseExternal(s,simulations=10){
 const start=performance.now();
 const g=convertState(s);
 const action=convertMove(new context.BridgeAI(simulations,1.4,false,false).chooseNextMove(g));
 if(!legal(s,action))throw Error('External engine selected illegal action '+JSON.stringify(action));
 return {pv:[action],elapsedMs:performance.now()-start,simulations};
}
