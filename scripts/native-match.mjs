import {Worker} from 'node:worker_threads';
import {writeFile} from 'node:fs/promises';
import {NativeProcess} from '../server/native-process.mjs';
import {EnginePool} from '../src/engine-pool.js';
import {openings,mazeOpenings} from '../evaluation/suite.js';
import {legal,apply} from '../src/engine.js';
function factory(){const w=new Worker(new URL('./test-fixtures/browser-worker-node.mjs',import.meta.url)),a={onmessage:null,onerror:null,postMessage:v=>w.postMessage(v),terminate:()=>w.terminate()};w.on('message',data=>a.onmessage?.({data}));w.on('error',e=>a.onerror?.(e));return a;}
const report={date:new Date().toISOString(),ms:500,cores:4,games:[],wins:0,losses:0,draws:0};
for(const fixture of [...openings('holdout',2),...mazeOpenings('holdout',2)])for(const side of [0,1]){
 const native=new NativeProcess(),web=new EnginePool({workers:4,workerFactory:factory});let state=structuredClone(fixture.state),reason='ply cap';const seen=new Map(),moves=[];
 try{await native.health();for(let ply=0;ply<180&&state.winner===null;ply++){
  const key=JSON.stringify([state.p,state.left,state.turn,state.walls.map(w=>[w.x,w.y,w.o]).sort()]),count=(seen.get(key)??0)+1;seen.set(key,count);if(count===3){reason='repetition';break;}
  const start=performance.now(),r=state.turn===side?await native.search(state,{ms:500,cores:4}):await web.search(state,{ms:500}),a=r.pv[0];if(!legal(state,a))throw Error('Illegal action');moves.push({side:state.turn,action:a,depth:r.depth,elapsedMs:performance.now()-start});state=apply(state,a);
 }if(state.winner!==null)reason='goal';const result=state.winner===null?'draws':state.winner===side?'wins':'losses';report[result]++;report.games.push({fixture:fixture.id,nativeSide:side,winner:state.winner,reason,moves});await writeFile('reports/fast-engine/native-match.json',JSON.stringify(report,null,2));console.log(fixture.id,side,result,moves.length);
 }finally{native.close();web.dispose();}
}
console.log(report.wins,report.losses,report.draws);
