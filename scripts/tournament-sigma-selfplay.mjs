import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {initial,moves,validWall,legal,apply,distance} from '../src/engine.js';
import {mkdirSync,writeFileSync,existsSync,readFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
const option=(name,def)=>{const i=process.argv.indexOf(name);return i<0?def:process.argv[i+1];};
const games=Number(option('--games',10)),exploration=Number(option('--exploration',0.25)),seed=Number(option('--seed',42));
if(!Number.isInteger(games)||games<1||games>500||!Number.isFinite(exploration)||exploration<0||exploration>1||!Number.isInteger(seed))throw Error('Invalid args');
const out=option('--out','reports/sigma-selfplay/sigma1-vs-sigma1.json');
const compare=process.argv.includes('--compare');
const sigma2Sims=Number(option('--sigma2-sims',200)),sigma2Reuse=process.argv.includes('--sigma2-reuse');
if(!Number.isInteger(sigma2Sims)||sigma2Sims<1||sigma2Sims>5000)throw Error('Invalid Sigma2 sims');
const version=compare?'sigma1-vs-sigma2-experimental-v1':'sigma1-puct50-selfplay-v1';
const processes=[0,1].map(side=>{
 const child=spawn('python',['-u','scripts/sigma-inference-worker.py'],{stdio:['pipe','pipe','inherit'],windowsHide:true,env:{...process.env,SIGMA_MODE:'puct',SIGMA_SIMS:'50',SIGMA_DIAGNOSTICS:'1',SIGMA_EXPLORATION:String(exploration),SIGMA_SEED:String(seed+side*1000003),SIGMA_VARIANT:compare?(side===0?'sigma1':'sigma2'):'sigma1',SIGMA2_SIMS:String(sigma2Sims),SIGMA2_REUSE:sigma2Reuse?'1':'0'}});
 const pending=new Map();
 let readyResolve;const ready=new Promise(r=>readyResolve=r);
 readline.createInterface({input:child.stdout}).on('line',line=>{let r;try{r=JSON.parse(line);}catch{return;}if(r.ready)return readyResolve();const job=pending.get(r.id);if(job){pending.delete(r.id);clearTimeout(job.timer);r.error?job.reject(Error(r.error)):job.resolve(r);}});
 child.on('exit',code=>{for(const job of pending.values()){clearTimeout(job.timer);job.reject(Error('worker exited '+code));}pending.clear();});
 return {child,ready,pending,async move(state,id,allowed,history=[]){return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{pending.delete(id);reject(Error('worker watchdog 30s'));},30000);pending.set(id,{resolve,reject,timer});child.stdin.write(JSON.stringify({id,state,allowed,history})+'\n');});}};
});
const actionsOf=s=>{const a=moves(s);if(s.left[s.turn])for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const w={type:'wall',x,y,o};if(validWall(s,w))a.push(w);}return a.map(x=>JSON.stringify(Object.fromEntries(Object.entries(x).sort(([a],[b])=>a.localeCompare(b)))));};
const modelHash=createHash('sha256').update(readFileSync('vendor/sigma-quoridor/models/best.onnx')).digest('hex');
mkdirSync('reports/sigma-selfplay',{recursive:true});
let report={version,modelHash,startingPosition:initial(),gamesRequested:games,exploration,seed,compare,sigma2Sims,sigma2Reuse,completed:[]};
if(process.argv.includes('--resume')&&existsSync(out)){
 const prev=JSON.parse(readFileSync(out,'utf8'));
 if(prev.version!==version||prev.modelHash!==modelHash||prev.gamesRequested!==games||prev.exploration!==exploration||prev.seed!==seed||prev.compare!==compare||prev.sigma2Sims!==sigma2Sims||prev.sigma2Reuse!==sigma2Reuse||prev.completed.length>games)throw Error('Selfplay resume settings mismatch');
 report=prev;
}
try{
 await Promise.all(processes.map(p=>p.ready));
 for(let i=report.completed.length;i<games;i++){
  let s=initial();const trace=[];let reason='ply-cap';const history=[];
  for(let ply=0;ply<200&&s.winner===null;ply++){
   const side=s.turn,workerIndex=compare?(side+i)%2:side,choice=await processes[workerIndex].move(s,String(i)+'-'+String(ply),actionsOf(s),history.slice(-32));
   const action=choice.pv?.[0];if(!action||!legal(s,action))throw Error('Illegal Sigma action');
   const next=apply(s,action);history.push({side,position:{...s.p[side]}});
   trace.push({ply,side,state:s,action,value:choice.value,elapsedMs:choice.elapsedMs,diagnostics:choice.diagnostics,pathBefore:[distance(s,0),distance(s,1)],pathAfter:[distance(next,0),distance(next,1)]});
   s=next;
   if(s.winner!==null)reason='goal';
  }
  const hash=createHash('sha256').update(JSON.stringify(trace.map(x=>x.action))).digest('hex');
  report.completed.push({index:i,winner:s.winner,winnerVariant:s.winner===null?null:compare?((s.winner+i)%2===0?'sigma1':'sigma2'):'sigma1',reason,plies:trace.length,hash,trace});
  const tmp=out+'.tmp';writeFileSync(tmp,JSON.stringify(report)+'\n');renameSync(tmp,out);
  console.log(i+1+'/'+games,'winner',s.winner,'plies',trace.length,'unique',new Set(report.completed.map(g=>g.hash)).size);
 }
}finally{for(const p of processes)p.child.kill();}
