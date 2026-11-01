import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {legal,apply,moves,validWall} from '../src/engine.js';
const fixtures=JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8'));
const games=15,mode=process.argv[2]||'policy',reportFile='reports/atlas6-reborn/sigma-onnx-'+mode+'-vs53-15.json';
const py=spawn('python',['-u','scripts/sigma-inference-worker.py'],{stdio:['pipe','pipe','inherit'],windowsHide:true,env:{...process.env,SIGMA_MODE:mode,SIGMA_SIMS:'20'}});
let seq=0;const pending=new Map();
readline.createInterface({input:py.stdout}).on('line',line=>{let x;try{x=JSON.parse(line);}catch{return;}const t=pending.get(x.id);if(t){pending.delete(x.id);if(x.error)t.reject(Error(x.error));else t.resolve(x);}});
const allLegal=state=>{const out=moves(state);if(state.left[state.turn]>0)for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const a={type:'wall',x,y,o};if(validWall(state,a))out.push(a);}return out.map(a=>JSON.stringify(Object.fromEntries(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)))));};
const query=state=>new Promise((resolve,reject)=>{const id=String(++seq);pending.set(id,{resolve,reject});py.stdin.write(JSON.stringify({id,state,allowed:allLegal(state)})+'\n');});
const r={candidate:'SigmaQuoridor 9x9 best.onnx mode='+mode,opponent:'Atlas5.3 candidate',games:[],wins:0,losses:0,undecided:0,forfeits:0,overruns:0};
mkdirSync('reports/atlas6-reborn',{recursive:true});
try{
for(let i=0;i<games;i++){
 const sigmaSide=i%2,fixture=fixtures[85+Math.floor(i/2)];
 let s=structuredClone(fixture.state),reason='ply-cap',forfeit=false,maxSigmaMs=0;
 const other=new NativeProcess({executable:nativeExecutable,profile:'candidate'});
 try{
 await other.health();
 for(let ply=0;ply<200&&s.winner===null;ply++){
  let choice;
  try{choice=s.turn===sigmaSide?await query(s):await other.search(s,{ms:500,cores:4});}
  catch(e){if(s.turn!==sigmaSide)throw e;forfeit=true;reason='adapter-error';console.log('FORFEIT',i,ply,e.message);break;}
  if(s.turn===sigmaSide){maxSigmaMs=Math.max(maxSigmaMs,choice.elapsedMs);if(choice.elapsedMs>500)r.overruns++;}
  if(!choice.pv?.[0]||!legal(s,choice.pv[0])){if(s.turn!==sigmaSide)throw Error('5.3 illegal action');forfeit=true;reason='illegal-action';console.log('FORFEIT',i,ply,JSON.stringify(choice.pv));break;}
  s=apply(s,choice.pv[0]);if(s.winner!==null)reason='goal';
 }
 }finally{await other.close();}
 const verdict=forfeit?'loss':s.winner===null?'undecided':s.winner===sigmaSide?'win':'loss';
 r[verdict==='win'?'wins':verdict==='loss'?'losses':'undecided']++;
 if(forfeit)r.forfeits++;
 r.games.push({fixture:fixture.id,sigmaSide,verdict,reason,maxSigmaMs});
 writeFileSync(reportFile,JSON.stringify(r,null,2)+'\n');
 console.log(i+1+'/15',verdict,'overall',r.wins+'W',r.losses+'L', 'maxSigmaMs',maxSigmaMs.toFixed(1));
}
}finally{py.kill();}
console.log('FINAL',JSON.stringify({wins:r.wins,losses:r.losses,undecided:r.undecided,forfeits:r.forfeits,overruns:r.overruns,winRate:r.wins/15*100}));
