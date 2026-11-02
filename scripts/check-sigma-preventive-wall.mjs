import {readFileSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {moves,validWall} from '../src/engine.js';
const game=JSON.parse(readFileSync('reports/sigma-selfplay/sigma2-reviewed-policy20.json')).completed[2];
const child=spawn('python',['-u','scripts/sigma-inference-worker.py'],{env:{...process.env,SIGMA_MODE:'puct',SIGMA_SIMS:'50',SIGMA2_SIMS:'200',SIGMA_VARIANT:'sigma2',SIGMA_SEED:'20261114',SIGMA_DIAGNOSTICS:'1'},stdio:['pipe','pipe','inherit'],windowsHide:true});
let ready,receive;readline.createInterface({input:child.stdout}).on('line',line=>{const r=JSON.parse(line);if(r.ready)ready?.();else receive?.(r)});
await new Promise(resolve=>{ready=resolve});
const result=[];
try{
 for(const ply of [17,19,21,23,25,27,29]){
  const step=game.trace[ply-1],s=step.state;
  const actions=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const a={type:'wall',x,y,o};if(validWall(s,a))actions.push(a)}
  const allowed=actions.map(a=>JSON.stringify(Object.fromEntries(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)))));
  const req={id:String(ply),state:{...s,ply:ply-1},allowed,history:game.trace.slice(0,ply-1).map(t=>({state:t.state}))};
  const response=await new Promise(resolve=>{receive=resolve;child.stdin.write(JSON.stringify(req)+'\n')});
  const row={ply,recorded:step.action,recommended:response.pv?.[0],error:response.error??null,preventive:response.diagnostics?.loopDebug?.preventive??null,leader:response.diagnostics?.loopDebug?.leader??null};
  result.push(row);console.log(JSON.stringify(row));
 }
}finally{child.kill()}
writeFileSync('evaluation/sigma2-preventive-wall-game2.json',JSON.stringify({game:2,scope:'independent replay snapshots; not complete new game',positions:result},null,2)+'\n');
