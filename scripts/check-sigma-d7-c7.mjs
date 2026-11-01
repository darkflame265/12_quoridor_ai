import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {initial,apply,moves,validWall,legal,distance} from '../src/engine.js';
import {readFileSync,writeFileSync} from 'node:fs';
const test=readFileSync('src/sigma-d7-c7-regression.test.js','utf8');
const raw=test.match(/const raw='([^']+)'/)[1].split(' ');
const convert=t=>t[0]==='m'?{type:'move',x:+t[1],y:+t[3]}:{type:'wall',o:t[0],x:+t[1],y:+t[3]};
const states=[initial()];
for(const t of raw){const last=states.at(-1);const a=convert(t);if(!legal(last,a))throw Error('invalid fixture');states.push(apply(last,a));}
const allowed=s=>{const a=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))a.push(w);}return a.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)))));};
async function evaluate(variant){
 const c=spawn('python',['-u','scripts/sigma-inference-worker.py'],{env:{...process.env,SIGMA_MODE:'puct',SIGMA_SIMS:'50',SIGMA2_SIMS:'200',SIGMA_VARIANT:variant,SIGMA_SEED:'26',SIGMA_DIAGNOSTICS:'1'},stdio:['pipe','pipe','inherit'],windowsHide:true});
 let ready,waiting;const q=[];const reader=readline.createInterface({input:c.stdout});
 reader.on('line',line=>{const value=JSON.parse(line);if(value.ready){ready?.();return;}if(waiting){waiting(value);waiting=null;}else q.push(value);});
 await new Promise(resolve=>{ready=resolve;});
 const out=[];
 for(const ply of [22,24,26,28,30]){
  const state=states[ply-1];
  const past=states.slice(0,ply-1).map(x=>({state:x,side:x.turn}));
  const response=await new Promise(resolve=>{waiting=resolve;c.stdin.write(JSON.stringify({id:ply,state:{...state,ply:ply-1},allowed:allowed(state),history:past})+'\n');});
  out.push({ply,variant,recommended:response.pv?.[0],elapsedMs:response.elapsedMs,error:response.error??null,loopDebug:response.diagnostics?.loopDebug,candidates:response.diagnostics?.topCandidates,ownDistance:distance(state,state.turn),opponentDistance:distance(state,1-state.turn)});
  console.log(JSON.stringify(out.at(-1)));
 }
 c.kill();return out;
}
const all=[...await evaluate('sigma1'),...await evaluate('sigma2')];
writeFileSync('evaluation/sigma2-d7-c7-check.json',JSON.stringify(all,null,2)+'\n');


const protectedPlies=all.filter(x=>x.variant==='sigma2'&&[26,28].includes(x.ply));
for(const row of protectedPlies){
 const old=convert(raw[row.ply-1]);
 if(row.recommended?.type==='move'&&row.recommended.x===old.x&&row.recommended.y===old.y)throw Error('Sigma2 still repeats original oscillation at '+row.ply);
 if(row.error)throw Error('Sigma2 failed: '+row.error);
}
const escape=all.find(x=>x.variant==='sigma2'&&x.ply===30);
if(escape.recommended?.type!=='move'||escape.recommended.x!==2||escape.recommended.y!==3)throw Error('Expected safe c6 escape at 30');
console.log('Regression: avoids 26/28 oscillation and recommends c6 at 30');
