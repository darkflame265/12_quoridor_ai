// No upstream source is vendored. Load only the pinned, separately fetched MIT engine.
import vm from 'node:vm';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
export const EXTERNAL_COMMIT='e15d6e7825e6f7c2f3a41de0ecef1af7aa290f1e';
export const EXTERNAL_URL='https://github.com/gorisanson/quoridor-ai';
export async function createExternalEngine(){
 const dir=new URL('../.external/quoridor-ai/',import.meta.url),{fileURLToPath}=await import('node:url');
 const actual=execFileSync('git',['-C',fileURLToPath(dir),'rev-parse','HEAD'],{encoding:'utf8'}).trim();if(actual!==EXTERNAL_COMMIT)throw Error('External engine commit mismatch; run npm run external:setup');
 const source=(await readFile(new URL('src/js/game.js',dir),'utf8'))+'\n'+(await readFile(new URL('src/js/ai.js',dir),'utf8'))+'\nglobalThis.ExternalGame=Game;globalThis.ExternalMCTS=MonteCarloTreeSearch;';
 let seed=271027;const math=Object.create(Math);math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const context=vm.createContext({console:{log:()=>{},warn:()=>{},error:()=>{}},postMessage:()=>{},Math:math});vm.runInContext(source,context,{timeout:2000});
 return {search(state,{ms=200,records=[]}={}){context.records=records;context.budget=ms;const start=performance.now();
  vm.runInContext(`globalThis.game=new ExternalGame(true);for(const a of records){const tuple=a.type==='move'?[[a.y,a.x],null,null]:a.o==='h'?[null,[a.y,a.x],null]:[null,null,[a.y,a.x]];if(game.doMove(tuple,true)===false)throw Error('Upstream rejected replay');}globalThis.tree=new ExternalMCTS(game,Math.SQRT2);`,context,{timeout:2000});
  const pawns=vm.runInContext('game.board.pawns.map(p=>({x:p.position.col,y:p.position.row}))',context);if(JSON.stringify(pawns)!==JSON.stringify(state.p))throw Error('External replay pawn mismatch');
  let timedOut=false;try{vm.runInContext('globalThis.started=Date.now();do{tree.search(8);}while(Date.now()-started<budget);',context,{timeout:Math.ceil(ms)+1500});}catch(error){if(error.code!=='ERR_SCRIPT_EXECUTION_TIMEOUT')throw error;timedOut=true;}
  const result=vm.runInContext('({move:tree.selectBestMove().move,simulations:tree.totalNumOfSimulations})',context,{timeout:1000}),m=result.move;
  const action=m[0]?{type:'move',x:m[0][1],y:m[0][0]}:m[1]?{type:'wall',x:m[1][1],y:m[1][0],o:'h'}:{type:'wall',x:m[2][1],y:m[2][0],o:'v'};
  return {pv:[action],nodes:result.simulations,depth:0,elapsedMs:performance.now()-start,engine:'gorisanson/quoridor-ai MCTS',timedOut};
 }};
}
