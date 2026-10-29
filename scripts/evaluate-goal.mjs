import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {NativeProcess} from '../server/native-process.mjs';
import {pressureExecutable,verifyPressureBuild} from '../evaluation/pressure-policy.mjs';
import {initial,apply,legal} from '../src/engine.js';
import {SPLITS,openings,mazeOpenings,tactics,checkTactic} from '../evaluation/suite.js';
import {nativeSourceHash,activeNativeProfile} from '../evaluation/native-policy.mjs';
const args=process.argv.slice(2),get=(key,fallback)=>{const i=args.indexOf(key);return i<0?fallback:args[i+1];};
const seed=Number(get('--seed',20261031)),pairs=Number(get('--pairs',2));if(!Number.isInteger(seed)||!Number.isInteger(pairs)||pairs<1||pairs>10)throw Error('Invalid options');
const folder=get('--out','reports/goal-safety04/development'),fixtures=JSON.parse(await readFile('evaluation/fixtures/goal-safety-regressions.json','utf8'));
try{await readFile(folder+'/report.json');throw Error('Use a fresh output directory');}catch(e){if(e.code!=='ENOENT')throw e;}await mkdir(folder,{recursive:true});
const make=on=>new NativeProcess({executable:pressureExecutable,profile:'candidate',env:{QUORIDOR_PRESSURE_MODE:'on',QUORIDOR_TEMPO_MODE:'on',QUORIDOR_GOAL_MODE:on?'on':'off',QUORIDOR_GOAL_EVAL_MODE:'off',QUORIDOR_PREP_MODE:'off',QUORIDOR_GOAL_DEEP_MODE:'off'}});
const report={identity:verifyPressureBuild(),sourceHash:nativeSourceHash(),defaultProfile:activeNativeProfile(),status:'running',productionEnabled:false,configuration:{rootOnly:true,maxExtension:0,goalOrdering:true,goalEvaluation:false,preparationChange:false},positions:[],tactics:[],games:[],seed,ms:500,cores:4};
async function save(){await writeFile(folder+'/report.json',JSON.stringify(report,null,2)+'\n');}
const candidate=make(true),baseline=make(false);
try{
 for(const f of fixtures){const d=(await candidate.request({op:'goal',state:f.state})).diagnostics;const c=await candidate.search(f.state,{ms:500,cores:4}),b=await baseline.search(f.state,{ms:500,cores:4});assert.ok(legal(f.state,c.pv[0]));report.positions.push({id:f.id,diagnostics:d,baseline:b,candidate:c});}
 assert.ok(report.positions.some(p=>p.diagnostics.details.active),'goal experiment must be active');
 for(const f of tactics()){const r=await candidate.search(f.state,{ms:500,cores:4}),pass=checkTactic(f,r.pv[0]);report.tactics.push({id:f.id,pass});assert.ok(pass,f.id);}
 candidate.close();baseline.close();
 // New deterministic seed; these are development games, not a release holdout.
 SPLITS['goal-study']=report.seed;
 for(const [suite,starts] of [['general',openings('goal-study',pairs+1).slice(1)],['maze',mazeOpenings('goal-study',pairs)]])for(const [index,start] of starts.entries())for(const side of [0,1]){
  const c=make(true),b=make(false),seen=new Map(),trace=[];let state=structuredClone(start.state),reason='ply cap';
  try{for(let ply=0;ply<160&&state.winner===null;ply++){
   const key=JSON.stringify([state.p,state.left,state.turn,state.walls.map(w=>[w.x,w.y,w.o]).sort()]),n=(seen.get(key)??0)+1;seen.set(key,n);if(n>=3){reason='repetition';break;}
   const role=state.turn===side?'candidate':'baseline',begin=performance.now(),r=await(role==='candidate'?c:b).search(state,{ms:500,cores:4});assert.ok(legal(state,r.pv[0]));trace.push({role,action:r.pv[0],score:r.score,depth:r.depth,elapsedMs:performance.now()-begin});state=apply(state,r.pv[0]);
  }if(state.winner!==null)reason='goal';let replay=initial();for(const a of [...start.records,...trace.map(t=>t.action)]){assert.ok(legal(replay,a));replay=apply(replay,a);}assert.deepEqual(replay,state);
   const result=state.winner===null?'draw':state.winner===side?'win':'loss';report.games.push({suite,index,candidateSide:side,result,reason,opening:start.records,trace});console.log(`${suite}-${index}-${side}: ${result}`);await save();
  }finally{c.close();b.close();}
 }
 report.summary={wins:report.games.filter(g=>g.result==='win').length,losses:report.games.filter(g=>g.result==='loss').length,draws:report.games.filter(g=>g.result==='draw').length};report.status='completed';await save();console.log(JSON.stringify(report.summary));
}catch(error){report.status='failed';report.error=error.message;await save();throw error;}finally{candidate.close();baseline.close();}
