// Production-path, time-budget round robin. No changes to engine policies.
// Resume verifies source/config hashes and never overwrites a different run.
import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createSigmaService} from '../server/sigma-service.mjs';
import {createSigma4Service} from '../server/sigma4-service.mjs';
import {AdaptiveEngine} from '../src/adaptive-engine.js';
import {NativeClient} from '../src/native-client.js';
import {apply,legal,clone,distance} from '../src/engine.js';
import {checkedSnapshot} from '../src/observed-state.js';
import {inferScreenMoves} from '../src/screen-sync.js';
import {positionKey,observationOutcome} from '../src/spectator.js';
import {progressSnapshot} from '../src/progress-review.js';
import {wallRun,wallStreak} from '../src/wall-streak.js';
import {runtimeFingerprint} from './runtime-identity.mjs';

const root=process.cwd(),out='reports/engine-comparison-20261106',file=out+'/results.json';
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const corpus=JSON.parse(await readFile('evaluation/sigma3-diverse-match-fixtures.json','utf8'));
const pilot=[0,1,16,22,25,40],followup=[3,6,21,24,34,46];
const fixtures=[...pilot,...followup].map(index=>{
 const f=corpus[index],state=checkedSnapshot(f.s),history=f.history.map(checkedSnapshot),records=[];
 const chain=[...history,state];for(let i=1;i<chain.length;i++){
  const step=inferScreenMoves(chain[i-1],chain[i]);if(step.length!==1)throw Error('Source history is not single-step legal');records.push(step[0]);
 }
 return {id:'source-'+index,index,phase:f.phase,state,history,records,hash:hash([state,history])};
});
if(new Set(fixtures.map(f=>positionKey(f.state))).size!==fixtures.length)throw Error('Duplicate source positions');
const pairs=[['sigma2','sigma3'],['sigma2','sigma4'],['sigma3','sigma4']];
const fingerprint=await runtimeFingerprint(root);
const config={version:1,budgetMs:500,cores:1,pilot,followup,maxContinuationPlies:200,fixturesHash:hash(fixtures),fingerprint,
 semantics:'Fresh per-game workers; model startup prewarmed; sequential actual HTTP + AdaptiveEngine; production policy/reuse defaults; no strength tuning',
 gate:{minScore:.65,maxWeakScore:.35,pairedOneSidedAlpha:.05/3,requireBothOpponents:true,allowCutoffsOrErrors:false},
 limitations:['Fixed historical corpus selected before results; not random/independent human opponents.','Seat-swapped games share a starting position; use source pairs as comparison units.','Adaptive followup is exploratory, not a certified global ranking.','Response time depends on hardware and includes HTTP overhead; native calls may overshoot a cooperative deadline.']};
await mkdir(out,{recursive:true});
let report;
try{report=JSON.parse(await readFile(file,'utf8'));if(hash(report.config)!==hash(config))throw Error('Resume source/config differs from frozen run');}
catch(e){if(e.code!=='ENOENT')throw e;report={config,fixtures,games:[],createdAt:new Date().toISOString()};}
async function save(){await writeFile(file+'.tmp',JSON.stringify(report,null,2));await rename(file+'.tmp',file);}
function signTail(wins,losses){const n=wins+losses;if(!n)return 1;let p=0,c=1;for(let k=0;k<=n;k++){if(k>=wins)p+=c/2**n;c=c*(n-k)/(k+1);}return p;}
function summaries(games){
 return pairs.map(([a,b])=>{
  const rows=games.filter(g=>g.a===a&&g.b===b),valid=rows.filter(g=>g.reason==='goal'||g.reason==='repetition');
  const winsA=valid.filter(g=>g.winner===a).length,winsB=valid.filter(g=>g.winner===b).length,draws=valid.filter(g=>g.reason==='repetition').length;
  const groups=[...new Set(rows.map(g=>g.fixture))].map(id=>{const list=valid.filter(g=>g.fixture===id);return {fixture:id,n:list.length,scoreA:list.length===2?list.reduce((v,g)=>v+(g.winner===a?1:g.winner===b?0:.5),0)/2:null};});
  const won=groups.filter(g=>g.scoreA!==null&&g.scoreA>.5).length,lost=groups.filter(g=>g.scoreA!==null&&g.scoreA<.5).length;
  return {a,b,games:rows.length,winsA,winsB,draws,cutoffs:rows.filter(g=>g.reason==='ply-cap').length,errors:rows.filter(g=>g.reason==='error').length,scoreA:valid.length?(winsA+.5*draws)/valid.length:null,sourceGroups:groups,pairedWinsA:won,pairedWinsB:lost,oneSidedA:signTail(won,lost),oneSidedB:signTail(lost,won)};
 });
}
async function play(a,b,fixture,swap,stage){
 const id=[a,b,fixture.id,swap].join(':');if(report.games.some(g=>g.id===id))return;
 if(await runtimeFingerprint(root)!==fingerprint)throw Error('Engine source changed during frozen tournament');
 const ids=swap?[b,a]:[a,b],services=ids.map(id=>id==='sigma4'?createSigma4Service():createSigmaService(id));
 const clients=[],started=Date.now();let state=clone(fixture.state),history=clone(fixture.history),records=clone(fixture.records),reason='ply-cap',winner=null,error=null;
 const trace=[],baseTurn=history[0]?.turn??state.turn,startHistory=history.length;
 try{
  for(let side=0;side<2;side++){
   const service=services[side];await service.client.health();await new Promise(r=>service.server.listen(0,'127.0.0.1',r));
   const endpoint='/api/'+ids[side],base='http://127.0.0.1:'+service.server.address().port;
   const native=new NativeClient({base:endpoint,fetcher:(url,options)=>fetch(base+url.slice(endpoint.length),options),autoProbe:false});
   if(!await native.probe())throw Error('Prewarm/identity probe failed');
   clients.push(new AdaptiveEngine({workers:1,engine:ids[side],nativeClient:native}));
  }
  for(let ply=0;ply<config.maxContinuationPlies;ply++){
   const outcome=observationOutcome(state,history,{maxPlies:startHistory+config.maxContinuationPlies,repetitions:3});
   if(outcome){reason=outcome.type==='win'?'goal':outcome.reason==='repetition'?'repetition':'ply-cap';winner=outcome.type==='win'?ids[outcome.winner]:null;break;}
   const turn=state.turn,snapshot={...progressSnapshot(state,history),historyStates:history.slice(-48),wallRun:wallRun(records,history,turn,baseTurn),recentPawnSquares:history.filter(s=>s.turn===turn).slice(-4).map(s=>s.p[turn].y*9+s.p[turn].x)};
   const t=performance.now(),result=await clients[turn].search(snapshot,{ms:config.budgetMs,wallStreak:wallStreak(records,turn,baseTurn)}),wallMs=performance.now()-t;
   const action=result.pv?.[0];if(!legal(state,action))throw Error('Illegal engine action: '+JSON.stringify(action));
   const next=apply(state,action);
   trace.push({engine:ids[turn],side:turn,action,wallMs,reportedMs:result.elapsedMs,simulations:result.simulations,budgetLimited:result.budgetLimited,pathsBefore:[distance(state,0),distance(state,1)],pathsAfter:[distance(next,0),distance(next,1)]});
   history.push(state);records.push(action);state=next;
   if(state.winner!==null){reason='goal';winner=ids[state.winner];break;}
  }
 }catch(e){reason='error';error=e.message;}
 finally{for(const client of clients)client.dispose();for(const service of services)await service.close();}
 if(await runtimeFingerprint(root)!==fingerprint)throw Error('Engine source changed before game completed');
 report.games.push({id,a,b,fixture:fixture.id,stage,swap,sides:ids,builds:services.map(s=>s.engineInfo),reason,winner,error,plies:trace.length,durationMs:Date.now()-started,trace,finalState:state,moveHash:hash(trace.map(t=>t.action))});
 report.summary=summaries(report.games);await save();
 console.log(JSON.stringify({completed:report.games.length,stage,pair:[a,b],fixture:fixture.id,swap,winner,reason,plies:trace.length,seconds:Math.round((Date.now()-started)/1000)}));
}
await save();
for(const f of fixtures.filter(f=>pilot.includes(f.index)))for(const [a,b]of pairs)for(const swap of [false,true])await play(a,b,f,swap,'pilot');
report.pilot=summaries(report.games.filter(g=>g.stage==='pilot'));
// Additional work is bounded and restricted to inconclusive pairings.
const close=report.pilot.filter(p=>p.errors||p.cutoffs||p.scoreA>=.25&&p.scoreA<=.75||Math.min(p.oneSidedA,p.oneSidedB)>.05/3);
report.followupPairs=close.map(p=>[p.a,p.b]);await save();
for(const f of fixtures.filter(f=>followup.includes(f.index)))for(const [a,b]of report.followupPairs)for(const swap of [false,true])await play(a,b,f,swap,'followup');
const summary=summaries(report.games),ids=['sigma2','sigma3','sigma4'];
function dominates(a,b){const p=summary.find(p=>[p.a,p.b].includes(a)&&[p.a,p.b].includes(b));if(!p||p.errors||p.cutoffs)return false;return p.a===a?p.scoreA>=config.gate.minScore&&p.oneSidedA<=config.gate.pairedOneSidedAlpha:1-p.scoreA>=config.gate.minScore&&p.oneSidedB<=config.gate.pairedOneSidedAlpha;}
const weakest=ids.find(id=>ids.filter(x=>x!==id).every(other=>dominates(other,id)))??null;
const strongest=ids.find(id=>ids.filter(x=>x!==id).every(other=>dominates(id,other)))??null;
report.summary=summary;report.decision={weakest,strongest,removalEvidencePassed:!!weakest,defaultEngine:strongest??'sigma4',reason:weakest?'One engine clearly loses both tested matchups under the exploratory paired gate.':'No engine meets the predeclared weakest-engine deletion gate. Preserve all three; do not equate numerical last place with proven inferiority.'};
report.finishedAt=new Date().toISOString();await save();console.log(JSON.stringify({done:true,summary,decision:report.decision}));
