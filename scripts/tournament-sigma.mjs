import {spawn} from 'node:child_process';
import readline from 'node:readline';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {NativeProcess,nativeExecutable} from '../server/native-process.mjs';
import {pressureExecutable} from '../evaluation/pressure-policy.mjs';
import {legal,apply,moves,validWall,initial} from '../src/engine.js';
import {createHash} from 'node:crypto';
const fixtureMode=process.argv.includes('--legacy-fixtures')?'legacy':'standard';
const fixtures=fixtureMode==='legacy'?JSON.parse(readFileSync('evaluation/atlas6-balanced-openings.json','utf8')):null;
const opt=(name,defaultValue)=>{const i=process.argv.indexOf(name);return i<0?defaultValue:process.argv[i+1]};
const games=Number(opt('--games',15)),startPair=Number(opt('--start-pair',85)),sims=Number(opt('--sims',20)),mode=process.argv[2]?.startsWith('--')?'puct':process.argv[2]||'policy';
if(!Number.isInteger(games)||games<2||games>2000||!Number.isInteger(startPair)||startPair<0||(fixtures!==null&&startPair+Math.ceil(games/2)>fixtures.length)||![20,50,100].includes(sims))throw Error('Invalid comparison args');
const opponent=opt('--opponent','atlas53');
if(!['atlas53','atlas04'].includes(opponent))throw Error('Unknown opponent');
const captureLosses=process.argv.includes('--capture-losses');
const captureDiagnostics=process.argv.includes('--diagnostics');
const resume=process.argv.includes('--resume');
const reportFile=opt('--out',`reports/atlas6-reborn/sigma-${mode}-${sims}sim-vs-${opponent}-${fixtureMode}-start${startPair}-${games}.json`);
const py=spawn('python',['-u','scripts/sigma-inference-worker.py'],{stdio:['pipe','pipe','inherit'],windowsHide:true,env:{...process.env,SIGMA_MODE:mode,SIGMA_SIMS:String(sims),SIGMA_DIAGNOSTICS:captureDiagnostics?'1':'0'}});
let seq=0;const pending=new Map();
let readyResolve;const ready=new Promise(resolve=>readyResolve=resolve);
readline.createInterface({input:py.stdout}).on('line',line=>{let x;try{x=JSON.parse(line);}catch{return;}if(x.ready){readyResolve();return;}const t=pending.get(x.id);if(t){pending.delete(x.id);if(x.error)t.reject(Error(x.error));else t.resolve(x);}});
const allLegal=state=>{const out=moves(state);if(state.left[state.turn]>0)for(let y=0;y<8;y++)for(let x=0;x<8;x++)for(const o of ['h','v']){const a={type:'wall',x,y,o};if(validWall(state,a))out.push(a);}return out.map(a=>JSON.stringify(Object.fromEntries(Object.entries(a).sort(([a],[b])=>a.localeCompare(b)))));};
const query=state=>new Promise((resolve,reject)=>{const id=String(++seq);const timer=setTimeout(()=>{pending.delete(id);reject(Error('Sigma worker failed to respond within 30000ms'));},30000);pending.set(id,{resolve:v=>{clearTimeout(timer);resolve(v)},reject:e=>{clearTimeout(timer);reject(e)}});py.stdin.write(JSON.stringify({id,state,allowed:allLegal(state)})+'\n');});
const standard=initial();
const identity={captureLosses,captureDiagnostics,fixtureMode,startingState:fixtureMode==='standard'?standard:null,modelHash:createHash('sha256').update(readFileSync('vendor/sigma-quoridor/models/best.onnx')).digest('hex'),opponentHash:createHash('sha256').update(readFileSync(opponent==='atlas04'?pressureExecutable:nativeExecutable)).digest('hex')};
let r={candidate:'Sigma PUCT '+sims,opponent:opponent==='atlas04'?'Atlas 0.4':'Atlas 5.3',sims,startPair,requested:games,...identity,games:[],wins:0,losses:0,undecided:0,forfeits:0,overruns:0};
mkdirSync('reports/atlas6-reborn',{recursive:true});
if(resume&&existsSync(reportFile)){
 const previous=JSON.parse(readFileSync(reportFile,'utf8'));
 if(previous.candidate!==r.candidate||previous.opponent!==r.opponent||previous.sims!==sims||previous.startPair!==startPair||previous.requested!==games||previous.fixtureMode!==fixtureMode||previous.captureLosses!==captureLosses||previous.captureDiagnostics!==captureDiagnostics||previous.modelHash!==identity.modelHash||previous.opponentHash!==identity.opponentHash||previous.games.length>games)throw Error('Resume report configuration mismatch');
 r=previous;
}
const save=()=>{const tmp=reportFile+'.tmp';writeFileSync(tmp,JSON.stringify(r,null,2)+'\n');renameSync(tmp,reportFile);};
try{
await ready;
for(let i=r.games.length;i<games;i++){
 const sigmaSide=i%2,fixture=fixtureMode==='standard'?{id:'standard-initial',state:standard}:fixtures[startPair+Math.floor(i/2)];
 let s=structuredClone(fixture.state),reason='ply-cap',forfeit=false,maxSigmaMs=0;
 const trace=[];const actions=[];
 const other=new NativeProcess({executable:opponent==='atlas04'?pressureExecutable:nativeExecutable,profile:'candidate',env:opponent==='atlas04'?{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:'on',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}:undefined});
 try{
 await other.health();
 for(let ply=0;ply<200&&s.winner===null;ply++){
  let choice;
  try{choice=s.turn===sigmaSide?await query(s):await other.search(s,{ms:500,cores:4});}
  catch(e){if(s.turn!==sigmaSide)throw e;if(e.message.includes('30000ms'))r.overruns++;forfeit=true;reason=e.message.includes('30000ms')?'watchdog':'adapter-error';console.log('FORFEIT',i,ply,e.message);break;}
  if(s.turn===sigmaSide){maxSigmaMs=Math.max(maxSigmaMs,choice.elapsedMs);if(choice.elapsedMs>500)r.overruns++;}
  if(!choice.pv?.[0]||!legal(s,choice.pv[0])){if(s.turn!==sigmaSide)throw Error(opponent+' illegal action');forfeit=true;reason='illegal-action';console.log('FORFEIT',i,ply,JSON.stringify(choice.pv));break;}
  actions.push(choice.pv[0]);
  if(captureLosses)trace.push({ply,side:s.turn,action:choice.pv[0],elapsedMs:choice.elapsedMs??null,position:s,...(captureDiagnostics&&s.turn===sigmaSide?{diagnostics:choice.diagnostics}: {})});
  s=apply(s,choice.pv[0]);if(s.winner!==null)reason='goal';
 }
 }finally{await other.close();}
 const verdict=forfeit?'loss':s.winner===null?'undecided':s.winner===sigmaSide?'win':'loss';
 r[verdict==='win'?'wins':verdict==='loss'?'losses':'undecided']++;
 if(forfeit)r.forfeits++;
 const gameHash=createHash('sha256').update(JSON.stringify(actions)).digest('hex');
 r.games.push({fixture:fixture.id,sigmaSide,verdict,reason,maxSigmaMs,plies:actions.length,gameHash,...(captureLosses&&verdict!=='win'?{opening:fixture.state,trace,finalState:s}:{})});
 save();
 console.log(i+1+'/'+games,verdict,'overall',r.wins+'W',r.losses+'L', 'maxSigmaMs',maxSigmaMs.toFixed(1));
}
}finally{py.kill();}
console.log('FINAL',JSON.stringify({uniqueGames:new Set(r.games.map(g=>g.gameHash)).size,wins:r.wins,losses:r.losses,undecided:r.undecided,forfeits:r.forfeits,overruns:r.overruns,winRate:r.wins/games*100}));
