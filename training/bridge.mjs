import readline from 'node:readline';
import {loadRuntime} from '../src/wasm-node.js';
import {Position,decode,encode} from '../src/search.js';
import {initial,apply,legal} from '../src/engine.js';
import {mazeOpenings,tactics,checkTactic} from '../evaluation/suite.js';
const engine=await loadRuntime();
function inspect(s){
 const p=new Position(s),info=engine.inspect(s),t=s.turn,own=p.distances(t),enemy=p.distances(1-t),weights=[],unsafe=[];let bestWall=0;
 for(const a of info.actions){const u=p.make(a);const mine=p.distances(t),theirs=p.distances(1-t);const gain=(theirs-enemy)-(mine-own)-(a>=81?1.4:0);weights.push(Math.exp(Math.min(20,gain*3)));if(a>=81)bestWall=Math.max(bestWall,gain);if(p.pawnMoves().some(m=>p.turn===0?m<9:m>=72))unsafe.push(a);p.unmake(u);}
 const moveTotal=weights.reduce((n,w,i)=>n+(info.actions[i]<81?w:0),0),wallTotal=weights.reduce((n,w,i)=>n+(info.actions[i]>=81?w:0),0),wallShare=wallTotal?(bestWall>=2?0.4:0.1):0;
 const prior=weights.map((w,i)=>info.actions[i]<81?w/(moveTotal||1)*(1-wallShare):w/(wallTotal||1)*wallShare);
 return {...info,prior,unsafe};
}
for await(const line of readline.createInterface({input:process.stdin,crlfDelay:Infinity})){
 try{const r=JSON.parse(line);let out;
  if(r.op==='initial')out={state:initial(),records:[]};
  else if(r.op==='opening'){const f=mazeOpenings(r.split??'development',r.index+1)[r.index];out={state:f.state,records:f.records};}
  else if(r.op==='tactics')out=tactics();
  else if(r.op==='checkTactic'){const f=tactics().find(f=>f.id===r.id);out={pass:checkTactic(f,r.action)};}
  else if(r.op==='search')out=engine.search(r.state,{ms:r.ms??50});
  else if(r.op==='validate'){let s=initial();for(const a of r.records){if(!legal(s,a))throw Error('Illegal self-play action');s=apply(s,a);}out={state:s};}
  else if(r.op==='inspectMany'){if(!Array.isArray(r.states)||r.states.length>512)throw Error('Invalid rules batch');out=r.states.map(inspect);}
  else out=inspect(r.state);
  process.stdout.write(JSON.stringify(out)+'\n');
 }catch(error){process.stdout.write(JSON.stringify({error:error.message})+'\n');}
}
