import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {readFileSync,writeFileSync} from 'node:fs';
import {moves,validWall} from '../src/engine.js';
const trace=JSON.parse(readFileSync('evaluation/sigma-userloss-main-replay.json','utf8'));
const state=trace.decisions[18].ply===19?trace.decisions[18]:null;
// A known, legal wall-heavy midgame position from the attached user game.
const all=s=>{const a=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))a.push(w);}return a.map(a=>JSON.stringify(Object.fromEntries(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)))));};
import {initial,apply} from '../src/engine.js';
let board=initial();for(const move of trace.decisions.slice(0,18))board=apply(board,move.action);
const results=[];
for(const [variant,sims,reuse] of [['sigma1',50,false],['sigma2',200,false],['sigma2',400,false],['sigma2',800,false],['sigma2',200,true]]){
 const t0=performance.now(),child=spawn('python',['-u','scripts/sigma-inference-worker.py'],{env:{...process.env,SIGMA_MODE:'puct',SIGMA_SIMS:'50',SIGMA_VARIANT:variant,SIGMA2_SIMS:String(sims),SIGMA2_REUSE:reuse?'1':'0'},stdio:['pipe','pipe','inherit'],windowsHide:true});
 let message,ready=false;
 try{
 message=await new Promise((resolve,reject)=>{
 const watchdog=setTimeout(()=>reject(Error('worker timeout')),30000);
 readline.createInterface({input:child.stdout}).on('line',line=>{const v=JSON.parse(line);if(v.ready&&!ready){ready=true;child.stdin.write(JSON.stringify({id:1,state:board,allowed:all(board)})+'\n');}else if(v.id===1){clearTimeout(watchdog);resolve(v);}});
 child.on('error',reject);
 });
 const entry={variant,sims,reuse,action:message.pv?.[0],elapsedMs:message.elapsedMs,processTotalMs:Math.round(performance.now()-t0),error:message.error??null};results.push(entry);console.log(JSON.stringify(entry));
 }finally{child.kill();}
}
writeFileSync('evaluation/sigma2-depth-benchmark.json',JSON.stringify({position:'user-loss main replay, before ply 19',results},null,2)+'\n');
